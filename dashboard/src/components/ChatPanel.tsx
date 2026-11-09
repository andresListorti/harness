import { useEffect, useId, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import './ChatPanel.css';
import { CLAUDE_MODELS, CODEX_CHAT_NOTICE, type ClaudeModel, type SettingsResponse } from '../../shared/api';
import { notifySettingsChanged, SETTINGS_CHANGED_EVENT } from '../lib/settings-events';
import { useVoice } from '../voice/VoiceProvider';
import { MicrophoneIcon } from './VoiceControls';

type Message = { id: number; role: 'user' | 'assistant'; text: string; source?: 'local' | 'orchestrator' };

export function ChatPanel({ client = api }: { client?: Pick<typeof api, 'getChatSuggestions' | 'sendChat' | 'getChatHistory' | 'clearChatHistory' | 'getSettings' | 'saveSettings'> }) {
  const voice = useVoice();
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [savingModel, setSavingModel] = useState(false);
  const settingsVersion = useRef(0);
  const request = useRef(0);
  const conversation = useRef(0);
  const busy = useRef(false);
  const nextId = useRef(0);
  const historyLoad = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const fieldId = useId();

  useEffect(() => {
    let active = true;
    setSettings(null);
    setSavingModel(false);
    const read = () => {
      const version = ++settingsVersion.current;
      void client.getSettings().then(result => {
        if (active && version === settingsVersion.current) setSettings(result);
      }).catch(() => {
        if (active && version === settingsVersion.current) setSettings(null);
      });
    };
    read();
    window.addEventListener(SETTINGS_CHANGED_EVENT, read);
    return () => {
      active = false;
      settingsVersion.current += 1;
      window.removeEventListener(SETTINGS_CHANGED_EVENT, read);
    };
  }, [client]);

  async function changeModel(chatModel: ClaudeModel) {
    if (!settings || savingModel) return;
    const previous = settings;
    const version = ++settingsVersion.current;
    setSettings({ ...previous, chatModel });
    setSavingModel(true);
    setError(null);
    try {
      const saved = await client.saveSettings({ orchestrator: previous.orchestrator, voice: previous.voice, chatModel });
      if (version !== settingsVersion.current) return;
      setSettings(saved);
      notifySettingsChanged();
    } catch {
      if (version !== settingsVersion.current) return;
      setSettings(previous);
      setError('Could not save the chat model.');
    } finally {
      setSavingModel(false);
    }
  }

  useEffect(() => {
    let active = true;
    const initialRequest = request.current;
    const initialLoad = ++historyLoad.current;
    void client.getChatHistory().then(history => {
      if (active && request.current === initialRequest && initialLoad === historyLoad.current) {
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
      const currentConversation = conversation.current;
      const response = client.sendChat(message);
      void voice?.trackChatReply?.(response, () => conversation.current !== currentConversation);
      const result = await response;
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

  const sendRef = useRef(send);
  sendRef.current = send;
  const subscribe = voice?.onTranscript;
  const registerChatSink = voice?.registerChatSink;
  const onChatSettled = voice?.onChatSettled;
  useEffect(() => subscribe?.(transcript => {
    setText(transcript);
  }), [subscribe]);
  useEffect(() => registerChatSink?.(value => sendRef.current(value)), [registerChatSink]);
  useEffect(() => {
    let active = true;
    const unsubscribe = onChatSettled?.(() => {
      if (busy.current) return;
      const current = request.current;
      const currentLoad = ++historyLoad.current;
      void client.getChatHistory().then(history => {
        if (active && !busy.current && current === request.current && currentLoad === historyLoad.current) {
          setMessages(history.messages.map(message => ({ ...message, id: nextId.current++ })));
        }
      }).catch(() => {});
    });
    return () => { active = false; unsubscribe?.(); };
  }, [client, onChatSettled]);

  async function reset() {
    try {
      await client.clearChatHistory();
    } catch {
      setError('Could not clear the saved history.');
      return;
    }
    request.current += 1;
    conversation.current += 1;
    busy.current = false;
    setPending(false);
    setMessages([]);
    setError(null);
    setText('');
  }

  return <section className="chat-panel" aria-label="Chat">
    <div className="chat-header">
      {voice && <>
        <button type="button" aria-label="Microphone" aria-pressed={voice.listening} onClick={voice.talk}><MicrophoneIcon /></button>
        <label><input type="checkbox" role="switch" checked={voice.replyWithVoice} onChange={event => voice.setReplyWithVoice(event.target.checked)} />Reply with voice</label>
        <label><input type="checkbox" role="switch" checked={voice.handsFree} onChange={event => voice.setHandsFree(event.target.checked)} />Hands-free</label>
      </>}
      <button type="button" onClick={reset} disabled={!messages.length && !error}>New chat</button></div>
    {settings?.orchestrator === 'claude-code' && <label className="chat-model">
      Claude Code model
      <select value={settings.chatModel} disabled={savingModel} onChange={event => void changeModel(event.target.value as ClaudeModel)}>
        {CLAUDE_MODELS.map(model => <option key={model} value={model}>{model}</option>)}
      </select>
    </label>}
    {settings?.orchestrator === 'codex' && <p className="chat-notice">
      {CODEX_CHAT_NOTICE} <a href="/api/docs/chat-isolation" target="_blank" rel="noopener noreferrer">Why?</a>
    </p>}
    <div ref={list} className="chat-messages" role="log" aria-live="polite" aria-label="Conversation">
      {!messages.length && <p className="chat-empty">Ask about tasks, commits, runs, or tests.</p>}
      {messages.map(message => <div key={message.id} className={`chat-message chat-message--${message.role}`}>
        <p>{message.text}</p>
        {message.role === 'assistant' && message.source && <small className="chat-source">{message.source === 'local' ? 'Local answer' : 'Orchestrator answer'}</small>}
      </div>)}
      {pending && <p className="chat-thinking" role="status">Thinking...</p>}
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
