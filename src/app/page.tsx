import { TopBar } from "@/components/top-bar";
import { Chat } from "./chat";

const ChatBotDemo = () => {
  return (
    <div className="h-screen flex flex-col w-full">
      <TopBar title="New Chat" />
      <Chat />
    </div>
  );
};

export default ChatBotDemo;
