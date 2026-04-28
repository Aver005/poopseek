import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface RoleInfo
{
    name: string;
    filePath: string;
}

const ROLES_DIR_NAME = "roles";

function getRolesDir(): string
{
    const poopseekDir = path.join(os.homedir(), ".poopseek");
    return path.join(poopseekDir, ROLES_DIR_NAME);
}

function ensureRolesDir(): string
{
    const dir = getRolesDir();
    if (!fs.existsSync(dir))
    {
        fs.mkdirSync(dir, { recursive: true });
    }

    return dir;
}

const VALID_ROLE_NAME_RE = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i;

export function validateRoleName(name: string): string | null
{
    if (!name || name.length === 0) return "Имя роли не может быть пустым";
    if (name.length > 64) return "Имя роли не может быть длиннее 64 символов";
    if (name === "." || name === "..") return "Недопустимое имя роли";
    if (name.includes("/") || name.includes("\\")) return "Имя роли не может содержать / или \\";
    if (!VALID_ROLE_NAME_RE.test(name)) return "Имя роли должно содержать только латинские буквы, цифры, точки, дефисы и подчёркивания (не может начинаться/заканчиваться спецсимволом)";
    return null;
}

function getRoleFilePath(roleName: string): string
{
    const dir = getRolesDir();
    const fileName = `${roleName}.role.md`;
    const fullPath = path.resolve(dir, fileName);

    // Path traversal guard: резолвим и проверяем что итоговый путь внутри папки ролей
    const resolvedDir = path.resolve(dir);
    if (!fullPath.startsWith(resolvedDir + path.sep))
    {
        throw new Error(`Недопустимое имя роли: ${roleName}`);
    }

    return fullPath;
}

export function listRoles(): RoleInfo[]
{
    const dir = getRolesDir();
    if (!fs.existsSync(dir)) return [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".role.md"))
        .map((entry) => ({
            name: entry.name.slice(0, -".role.md".length),
            filePath: path.join(dir, entry.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function loadRoleContent(roleName: string): string | null
{
    const error = validateRoleName(roleName);
    if (error) return null;
    const filePath = getRoleFilePath(roleName);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8").trim();
}

export function roleExists(roleName: string): boolean
{
    const error = validateRoleName(roleName);
    if (error) return false;
    return fs.existsSync(getRoleFilePath(roleName));
}

export function saveRole(
    roleName: string,
    content: string,
    options: { overwrite?: boolean } = {},
): string
{
    const error = validateRoleName(roleName);
    if (error) throw new Error(error);
    ensureRolesDir();
    const filePath = getRoleFilePath(roleName);
    if (!options.overwrite && fs.existsSync(filePath))
    {
        throw new Error(`Роль ${roleName} уже существует. Используйте overwrite=true для замены.`);
    }
    fs.writeFileSync(filePath, content.trim() + "\n", "utf-8");
    return filePath;
}

export function deleteRole(roleName: string): boolean
{
    const error = validateRoleName(roleName);
    if (error) return false;
    const filePath = getRoleFilePath(roleName);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
}
