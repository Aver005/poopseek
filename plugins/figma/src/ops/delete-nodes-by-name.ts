import type { OpHandler } from "./types";

export const handler: OpHandler = {
    type: "delete_nodes_by_name",
    async execute(op, nodeMap): Promise<number> {
        const names: string[] = Array.isArray(op.names) ? op.names as string[] : [];
        let count = 0;
        for (const name of names) {
            nodeMap.delete(name);
            const toRemove = figma.currentPage.children.filter(n => n.name === name);
            for (const node of toRemove) {
                node.remove();
                count++;
            }
        }
        return count;
    },
};
