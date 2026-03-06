- option to delete previous chat request/response, individually (there is button to clear chat)
- option to save current doc as a different name
- timer to show AI response time
- counters for tokens in and out
  - future support prompt cache
- button to retry last chat request
- option to copy chat history to current md file or clipboard
- toggle for one chat per file or pin single shared chat

- remember tabs and positions using browser storage, ignore files that no longer exist

- select md file for system prompt
- select model or specify in prompt md file
- note: AI only changes current file!

New Phase 2
- undo/version history since auto-save could save mistakes by accident. 
  - There is already local undo functionality which should be working.
  - Planned ability to commit to a Git repo.
  - Still useful to keep local checkpoints.
  - Checkpoints every 1min.
  - Keep up to: every min for 10 min. Every 10 min for 1 hr. Every 1 hr for 1 day. Every 1 day for 5 days.
  - Store in a .checkpoints folder which will be added to .gitignore.
  - Match folder structure and filename with a timestamp suffix.
  - Provide a method to see previous versions and open read-only for copy/pase.
- TOC navigator to easily scroll through large files.

