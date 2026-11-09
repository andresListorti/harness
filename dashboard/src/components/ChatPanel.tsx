import { useEffect, useId, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import './ChatPanel.css';

type Message = { id: number; role: 'user' | 'assistant'; text: string; source?: 'local' };

export function ChatPanel({ client = api }: { client?: Pick<typeof api, 'getChatSuggestions' | 'sendChat' | 'getChatHistory' | 'clearChatHistory'> }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const busy = useRef(false);
  const nextId = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const fieldId = useId();

  useEffect(() => {
    let active = true;
    const initialRequest = request.current;
    void client.getChatHistory().then(history => {
      if (active && request.current === initialRequest) {
        setMessages(history.messages.map(message => ({ ...message, id: nextId.current++ })));
      }
    }).catch(() => {});
    setSuggestions([]);
    void client.getChatSuggestions().then(result => {
      if (active) setSuggestions(result.suggestions);
    }).catch(() => {});
    return () => { active = false; };
  }, [client]);

  useEffect(() => () => { request.current += 1; }, []);

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages, pending]);

  async function send(value: string) {
    const message = value.trim();
    if (!message || busy.current) return;
    const current = ++request.current;
    busy.current = true;
    const userMessage: Message = { id: nextId.current++, role: 'user', text: message };
    setMessages(previous => [...previous, userMessage]);
    setText('');
    setError(null);
    setPending(true);
    try {
      const result = await client.sendChat(message);
      if (current !== request.current) return;
      const reply: Message = { id: nextId.current++, role: 'assistant', text: result.reply, source: result.source };
      setMessages(previous => [...previous, reply]);
    } catch (cause) {
      if (current !== request.current) return;
      setError(cause instanceof ApiError ? `Could not get an answer: ${cause.message}` : 'Could not get an answer.');
    } finally {
      if (current === request.current) {
        busy.current = false;
        setPending(false);
      }
    }
  }

  async function reset() {
    try {
      await client.clearChatHistory();
    } catch {
      setError('Could not clear the saved history.');
      return;
    }
    request.current += 1;
    busy.current = false;
    setPending(false);
    setMessages([]);
    setError(null);
    setText('');
  }

  return <section className="chat-panel" aria-label="Chat">
    <div className="chat-header"><button type="button" onClick={reset} disabled={!messages.length && !error}>New chat</button></div>
    <div ref={list} className="chat-messages" role="log" aria-live="polite" aria-label="Conversation">
      {!messages.length && <p className="chat-empty">Ask about tasks, commits, runs, or tests. Answers come straight from the repo; no agent runs.</p>}
      {messages.map(message => <div key={message.id} className={`chat-message chat-message--${message.role}`}>
        <p>{message.text}</p>
        {message.source === 'local' && <small className="chat-source">Local answer</small>}
      </div>)}
      {pending && <p className="chat-thinking">Thinking…</p>}
    </div>
    {error && <p className="chat-error" role="alert">{error}</p>}
    {suggestions.length > 0 && <div className="chat-suggestions" role="group" aria-label="Suggested questions">
      {suggestions.map((suggestion, index) => <button type="button" key={index} disabled={pending} onClick={() => void send(suggestion)}>{suggestion}</button>)}
    </div>}
    <form className="chat-compose" onSubmit={event => { event.preventDefault(); void send(text); }}>
      <label className="chat-label" htmlFor={fieldId}>Message</label>
      <input id={fieldId} value={text} onChange={event => setText(event.target.value)} maxLength={2000} />
      <button type="submit" disabled={pending}>Send</button>
    </form>
  </section>;
}
