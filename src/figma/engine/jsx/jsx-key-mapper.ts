export function mapKeyToId(jsx: string): string
{
    return jsx.replace(/\bkey="([^"]+)"/g, 'id="$1"');
}
