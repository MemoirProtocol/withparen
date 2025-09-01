// WebSocket Integration for Real-time Chat
import { io } from 'socket.io-client';
import { useState, useEffect, useRef } from 'react';

export class ElizaWebSocketClient {
  constructor(baseURL = 'https://webchat.withseren.com', options = {}) {
    this.baseURL = baseURL;
    this.socket = null;
    this.options = {
      secure: true,
      rejectUnauthorized: true,
      ...options
    };
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect() {
    if (this.socket?.connected) return;

    this.socket = io(this.baseURL, {
      transports: ['websocket', 'polling'],
      secure: true,
      upgrade: true,
      rememberUpgrade: true,
      timeout: 20000,
      forceNew: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      maxReconnectionAttempts: this.maxReconnectAttempts,
      ...this.options
    });

    this.socket.on('connect', () => {
      console.log('Connected to ElizaOS WebSocket');
      this.reconnectAttempts = 0;
      this.emit('connected', true);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from ElizaOS WebSocket:', reason);
      this.emit('connected', false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
        this.emit('connectionFailed', error);
      }
    });

    this.socket.on('messageBroadcast', (data) => {
      this.emit('message', data);
    });

    this.socket.on('messageComplete', (data) => {
      this.emit('messageComplete', data);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinChannel(channelId) {
    if (this.socket) {
      this.socket.emit('join', channelId);
    }
  }

  leaveChannel(channelId) {
    if (this.socket) {
      this.socket.emit('leave', channelId);
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }
}

// Enhanced React Hook with WebSocket
export const useElizaChatWithWebSocket = (agentId, options = {}) => {
  const [client] = useState(() => new ElizaAPIClient(
    options.baseURL || 'https://webchat.withseren.com',
    options.apiKey // No default API key for testing
  ));
  
  const [wsClient] = useState(() => new ElizaWebSocketClient(
    options.baseURL || 'https://webchat.withseren.com'
  ));
  
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [channelId, setChannelId] = useState(null);
  const [connected, setConnected] = useState(false);

  // Initialize WebSocket connection
  useEffect(() => {
    wsClient.connect();
    
    wsClient.on('connected', (isConnected) => {
      setConnected(isConnected);
      if (!isConnected) {
        setError('Connection lost. Attempting to reconnect...');
      } else {
        setError(null);
      }
    });

    wsClient.on('connectionFailed', (error) => {
      setConnected(false);
      setError('Failed to connect to chat server. Please refresh the page.');
    });
    
    wsClient.on('message', (data) => {
      const message = {
        id: data.id || Date.now(),
        content: data.text,
        author: data.senderName,
        timestamp: data.createdAt,
        isUser: data.senderId !== agentId,
        thought: data.thought,
        actions: data.actions,
        attachments: data.attachments
      };
      
      setMessages(prev => {
        // Avoid duplicates
        if (prev.some(msg => msg.id === message.id)) {
          return prev;
        }
        return [...prev, message];
      });
    });

    wsClient.on('messageComplete', () => {
      setLoading(false);
    });

    return () => {
      wsClient.disconnect();
    };
  }, [wsClient, agentId]);

  // Initialize channel and join WebSocket room
  useEffect(() => {
    const initChannel = async () => {
      try {
        const channelName = `web-chat-${Date.now()}`;
        const response = await client.createChannel(channelName);
        const newChannelId = response.data.id;
        
        setChannelId(newChannelId);
        wsClient.joinChannel(newChannelId);
        setConnected(true);
      } catch (err) {
        setError(err.message);
      }
    };

    initChannel();

    return () => {
      if (channelId) {
        wsClient.leaveChannel(channelId);
      }
    };
  }, [client, wsClient]);

  const sendMessage = useCallback(async (message, userOptions = {}) => {
    if (!channelId || !connected) {
      setError('Not connected to chat');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await client.sendMessage(channelId, message, {
        userId: userOptions.userId || 'web-user-' + Date.now(),
        userName: userOptions.userName || 'Website Visitor',
        ...userOptions
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, [client, channelId, connected]);

  return {
    messages,
    sendMessage,
    loading,
    error,
    connected,
    channelId
  };
};

// Advanced Chat Component with WebSocket
export const ElizaAdvancedChatWidget = ({ 
  agentId, 
  className = '',
  rateLimit = { maxRequests: 8, windowMs: 60000 },
  apiKey = null
}) => {
  const [input, setInput] = useState('');
  const { messages, sendMessage, loading, error, connected } = useElizaChatWithWebSocket(agentId, { apiKey });
  const { isAllowed, getRemainingRequests, getTimeUntilReset, rateLimitError } = useRateLimit(rateLimit.maxRequests, rateLimit.windowMs);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (!isAllowed()) {
      return; // Rate limit error is handled by the hook
    }

    await sendMessage(input, {
      userName: 'Website Visitor',
      userId: localStorage.getItem('elizaUserId') || (() => {
        const id = 'web-user-' + Date.now();
        localStorage.setItem('elizaUserId', id);
        return id;
      })()
    });
    
    setInput('');
  };

  const formatMessage = (content) => {
    // Basic markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  };

  return (
    <div className={`eliza-advanced-chat ${className}`}>
      <div className="chat-header">
        <div className="status">
          <span className={`indicator ${connected ? 'connected' : 'disconnected'}`}></span>
          {connected ? 'Connected' : 'Connecting...'}
        </div>
        <div className="rate-limit">
          {getRemainingRequests()}/{rateLimit.maxRequests} requests remaining
        </div>
      </div>

      <div className="chat-messages">
        {messages.map(message => (
          <div 
            key={message.id} 
            className={`message ${message.isUser ? 'user' : 'agent'}`}
          >
            <div className="message-header">
              <strong>{message.author}</strong>
              <span className="timestamp">
                {new Date(message.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div 
              className="message-content"
              dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
            />
            {message.thought && (
              <div className="message-thought">
                <em>Thinking: {message.thought}</em>
              </div>
            )}
            {message.attachments && message.attachments.length > 0 && (
              <div className="message-attachments">
                {message.attachments.map((attachment, idx) => (
                  <div key={idx} className="attachment">
                    {attachment.contentType === 'image' ? (
                      <img src={attachment.url} alt={attachment.title} />
                    ) : (
                      <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                        {attachment.title || 'Attachment'}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        
        {loading && (
          <div className="message agent">
            <div className="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
        
        {(error || rateLimitError) && (
          <div className="error-message">
            Error: {rateLimitError || error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={handleSubmit} className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={loading || !connected}
          maxLength={500}
        />
        <button 
          type="submit" 
          disabled={loading || !input.trim() || !connected || !isAllowed()}
        >
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
};

export default ElizaWebSocketClient;/
/ Production Usage Examples with WebSocket
export const WebSocketProductionExamples = {
  // Advanced chat with WebSocket
  advanced: () => (
    <ElizaAdvancedChatWidget 
      agentId="3c0b933c-a2c6-06f9-abdc-dbd48eb48314"
      className="advanced-chat"
      rateLimit={{ maxRequests: 8, windowMs: 60000 }}
      apiKey="n13in13kfdjn13irju1i3d1i3d"
    />
  ),

  // Custom WebSocket configuration
  customWebSocket: () => {
    const { messages, sendMessage, loading, error, connected } = useElizaChatWithWebSocket(
      "3c0b933c-a2c6-06f9-abdc-dbd48eb48314",
      {
        baseURL: 'https://webchat.withseren.com',
        apiKey: 'n13in13kfdjn13irju1i3d1i3d'
      }
    );

    return (
      <div className="realtime-chat">
        <div className="connection-status">
          <span className={connected ? 'connected' : 'disconnected'}>
            {connected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
        </div>
        {/* Rest of your custom UI */}
      </div>
    );
  }
};

// Advanced CSS Styles for WebSocket chat
export const AdvancedChatStyles = `
.eliza-advanced-chat {
  max-width: 500px;
  height: 600px;
  border: 1px solid #ddd;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #f8f9fa;
  border-bottom: 1px solid #e0e0e0;
  border-radius: 12px 12px 0 0;
}

.status {
  display: flex;
  align-items: center;
  font-size: 14px;
  color: #666;
}

.indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}

.indicator.connected {
  background: #28a745;
}

.indicator.disconnected {
  background: #dc3545;
}

.rate-limit {
  font-size: 12px;
  color: #888;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: #f9f9f9;
}

.message {
  margin-bottom: 16px;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  font-size: 12px;
  color: #666;
}

.message-content {
  padding: 10px 14px;
  border-radius: 16px;
  max-width: 85%;
  word-wrap: break-word;
}

.message.user .message-content {
  background: #007bff;
  color: white;
  margin-left: auto;
}

.message.agent .message-content {
  background: white;
  border: 1px solid #e0e0e0;
  color: #333;
}

.message-thought {
  font-size: 11px;
  color: #888;
  margin-top: 4px;
  padding: 4px 8px;
  background: #f0f0f0;
  border-radius: 8px;
  max-width: 85%;
}

.message-attachments {
  margin-top: 8px;
}

.attachment img {
  max-width: 200px;
  border-radius: 8px;
}

.typing-indicator {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 16px;
  max-width: 60px;
}

.typing-indicator span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #999;
  margin: 0 1px;
  animation: typing 1.4s infinite ease-in-out;
}

.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

@keyframes typing {
  0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

.error-message {
  background: #fee;
  color: #c33;
  padding: 12px;
  border-radius: 8px;
  margin: 8px 16px;
  border: 1px solid #fcc;
  font-size: 14px;
}

.chat-input {
  display: flex;
  padding: 16px;
  border-top: 1px solid #ddd;
  background: white;
  border-radius: 0 0 12px 12px;
}

.chat-input input {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid #ddd;
  border-radius: 24px;
  outline: none;
  margin-right: 8px;
  font-size: 14px;
}

.chat-input input:focus {
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
}

.chat-input button {
  padding: 10px 20px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 24px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.2s;
}

.chat-input button:hover:not(:disabled) {
  background: #0056b3;
}

.chat-input button:disabled {
  background: #ccc;
  cursor: not-allowed;
}
`;