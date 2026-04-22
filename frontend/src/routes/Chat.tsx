import ChatPanel from "../components/chat/ChatPanel";

export default function Chat() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="h-[calc(100vh-8rem)] overflow-hidden rounded-lg border border-hairline bg-raised">
        <ChatPanel mode="fullpage" />
      </div>
    </div>
  );
}
