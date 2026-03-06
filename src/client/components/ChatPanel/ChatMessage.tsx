import type { ChatMessage as ChatMessageType } from '../../hooks/useChatHistory';
import EditConfirmation from './EditConfirmation';

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  return (
    <div className={`chat-message chat-message-${message.role}`}>
      <div className="chat-message-header">
        <span className="chat-message-icon">
          {isUser ? '👤' : isAssistant ? '🤖' : 'ℹ️'}
        </span>
        <span className="chat-message-role">
          {isUser ? 'You' : isAssistant ? 'AI' : 'System'}
        </span>
        <span className="chat-message-time">{formatTime(message.timestamp)}</span>
        {isStreaming && <span className="chat-streaming">●</span>}
      </div>
      <div className="chat-message-content">
        {message.content || (isStreaming ? '' : '*(empty)*')}
      </div>
      {message.edits && message.edits.length > 0 && (
        <EditConfirmation edits={message.edits} />
      )}
    </div>
  );
}
