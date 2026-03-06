import type { ChatEdit } from '../../hooks/useChatHistory';

interface EditConfirmationProps {
  edits: ChatEdit[];
}

export default function EditConfirmation({ edits }: EditConfirmationProps) {
  if (!edits || edits.length === 0) return null;

  return (
    <div className="chat-edit-block">
      <div className="chat-edit-header">
        📝 Document edits ({edits.filter((e) => e.applied).length}/{edits.length} applied)
      </div>
      {edits.map((edit, i) => (
        <div
          key={i}
          className={`chat-edit-item ${edit.applied ? 'chat-edit-applied' : 'chat-edit-failed'}`}
        >
          <div className="chat-edit-status">
            {edit.applied ? '✅' : '❌'} {edit.applied ? 'Applied' : edit.reason || 'Failed'}
          </div>
          <div className="chat-edit-diff">
            <div className="chat-edit-search">
              <span className="chat-edit-label">−</span>
              <code>{edit.search.length > 200 ? edit.search.slice(0, 200) + '…' : edit.search}</code>
            </div>
            <div className="chat-edit-replace">
              <span className="chat-edit-label">+</span>
              <code>{edit.replace.length > 200 ? edit.replace.slice(0, 200) + '…' : edit.replace}</code>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
