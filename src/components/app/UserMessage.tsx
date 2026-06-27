interface UserMessageProps {
  text: string;
}

export default function UserMessage({ text }: UserMessageProps) {
  return (
    <div className="flex justify-end px-4 py-2">
      <div className="max-w-[75%] rounded-2xl rounded-br-sm border border-border-accent bg-accent/10 px-4 py-3 text-sm leading-relaxed text-text">
        {text}
      </div>
    </div>
  );
}
