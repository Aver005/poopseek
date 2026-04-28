import type { DeepseekWebProvider } from "@/providers/deepseek-web";
import type { RemoteSessionImporter } from "@/sessions";

const MAX_MESSAGE_CONTENT = 12000;
const MAX_LOCAL_MESSAGES = 300;

export function createDeepseekHistoryImporter(provider: DeepseekWebProvider): RemoteSessionImporter
{
    return {
        async import(sessionId, signal)
        {
            const assertNotAborted = (): void =>
            {
                if (signal.aborted) throw new Error("Загрузка сессии прервана (Ctrl+C)");
            };
            const yieldControl = (): Promise<void> =>
                new Promise<void>((resolve) => setTimeout(resolve, 0));

            const { chat_session, chat_messages } = await provider.fetchHistory(sessionId, signal);
            assertNotAborted();

            const messageMap = new Map(chat_messages.map((msg) => [msg.message_id, msg]));
            const chain: typeof chat_messages = [];
            let currentId: number | null = chat_session.current_message_id;
            const visited = new Set<number>();
            let guard = 0;

            while (currentId !== null)
            {
                if ((guard & 255) === 0)
                {
                    await yieldControl();
                    assertNotAborted();
                }
                if (visited.has(currentId))
                {
                    throw new Error(`cycle detected in message chain at id=${currentId}`);
                }
                visited.add(currentId);
                guard += 1;
                if (guard > chat_messages.length + 1)
                {
                    throw new Error("message chain traversal overflow");
                }
                const msg = messageMap.get(currentId);
                if (!msg) break;
                chain.unshift(msg);
                currentId = msg.parent_id;
            }

            const localMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
            for (let index = 0; index < chain.length; index += 1)
            {
                if ((index & 63) === 0)
                {
                    await yieldControl();
                    assertNotAborted();
                }
                const msg = chain[index];
                if (!msg || msg.status !== "FINISHED") continue;
                const role = msg.role === "USER" ? "user" : msg.role === "ASSISTANT" ? "assistant" : null;
                if (!role) continue;
                const contentType = role === "user" ? "REQUEST" : "RESPONSE";
                const content = msg.fragments
                    .filter((f) => f.type === contentType)
                    .map((f) => f.content)
                    .join("\n")
                    .trim();
                if (content.length === 0) continue;
                if (content.startsWith("### TOOL RESULT:") || content.startsWith("### SYSTEM SNAPSHOT")) continue;
                localMessages.push({
                    role,
                    content: content.length > MAX_MESSAGE_CONTENT
                        ? content.slice(0, MAX_MESSAGE_CONTENT)
                        : content,
                });
            }

            const trimmedMessages = localMessages.length > MAX_LOCAL_MESSAGES
                ? localMessages.slice(localMessages.length - MAX_LOCAL_MESSAGES)
                : localMessages;

            const lastMsg = chain[chain.length - 1];

            return {
                title: chat_session.title || sessionId,
                messages: trimmedMessages,
                parentMessageId: lastMsg?.message_id ?? null,
            };
        },

        apply(sessionId, parentMessageId)
        {
            provider.loadRemoteSession(sessionId, parentMessageId);
        },
    };
}
