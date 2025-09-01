// ElizaOS API Client for React Landing Page
class ElizaAPIClient {
  constructor(baseURL = 'https://webchat.withseren.com', apiKey = null) {
    this.baseURL = baseURL;
    this.apiKey = apiKey;
  }

  // Helper method for API requests with enhanced error handling
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}/api${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add API key if configured
    if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }

    const config = {
      ...options,
      headers,
      // Add credentials for CORS
      credentials: 'include',
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 429) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Rate limit exceeded. Please try again later.');
        }
        
        if (response.status >= 500) {
          throw new Error('Server error. Please try again later.');
        }
        
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Request failed:', error);
      
      // Network error handling
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error. Please check your connection.');
      }
      
      throw error;
    }
  }

  // Get list of available agents
  async getAgents() {
    return this.request('/agents');
  }

  // Get specific agent details
  async getAgent(agentId) {
    return this.request(`/agents/${agentId}`);
  }

  // Send a message to an agent
  async sendMessage(channelId, message, options = {}) {
    const payload = {
      author_id: options.userId || 'user-' + Date.now(), // Generate user ID
      content: message,
      server_id: options.serverId || '00000000-0000-0000-0000-000000000000',
      source_type: 'web_chat',
      raw_message: { text: message },
      metadata: {
        user_display_name: options.userName || 'Website Visitor',
        timestamp: Date.now(),
        ...options.metadata
      }
    };

    return this.request(`/messaging/central-channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Get message history for a channel
  async getMessages(channelId, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.offset) params.append('offset', options.offset);
    
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/messaging/central-channels/${channelId}/messages${query}`);
  }

  // Create a new channel/room
  async createChannel(name, options = {}) {
    const payload = {
      name,
      server_id: options.serverId || '00000000-0000-0000-0000-000000000000',
      metadata: options.metadata || {}
    };

    return this.request('/messaging/central-channels', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

// React Hook for ElizaOS Integration
import { useState, useEffect, useCallback } from 'react';

export const useElizaChat = (agentId, options = {}) => {
  const [client] = useState(() => new ElizaAPIClient(
    options.baseURL || 'https://webchat.withseren.com',
    options.apiKey // No default API key for testing
  ));
  
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [channelId, setChannelId] = useState(null);

  // Initialize channel
  useEffect(() => {
    const initChannel = async () => {
      try {
        // Create or get existing channel
        const channelName = `web-chat-${Date.now()}`;
        const response = await client.createChannel(channelName);
        setChannelId(response.data.id);
      } catch (err) {
        setError(err.message);
      }
    };

    initChannel();
  }, [client]);

  // Send message function
  const sendMessage = useCallback(async (message, userOptions = {}) => {
    if (!channelId) {
      setError('Channel not initialized');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Add user message to local state immediately
      const userMessage = {
        id: Date.now(),
        content: message,
        author: userOptions.userName || 'You',
        timestamp: Date.now(),
        isUser: true
      };
      
      setMessages(prev => [...prev, userMessage]);

      // Send to API
      await client.sendMessage(channelId, message, {
        userId: userOptions.userId,
        userName: userOptions.userName,
        ...userOptions
      });

      // Poll for agent response (or use WebSocket in production)
      setTimeout(async () => {
        try {
          const response = await client.getMessages(channelId, { limit: 10 });
          const newMessages = response.data.messages
            .filter(msg => msg.id > userMessage.id)
            .map(msg => ({
              id: msg.id,
              content: msg.content,
              author: msg.metadata?.agentName || 'Agent',
              timestamp: msg.created_at,
              isUser: false
            }));
          
          setMessages(prev => [...prev, ...newMessages]);
        } catch (err) {
          console.error('Error fetching response:', err);
        }
      }, 2000);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [client, channelId]);

  return {
    messages,
    sendMessage,
    loading,
    error,
    channelId
  };
};

// React Component Example
export const ElizaChatWidget = ({ agentId, className = '', apiKey = null }) => {
  const [input, setInput] = useState('');
  const { messages, sendMessage, loading, error } = useElizaChat(agentId, { apiKey });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    await sendMessage(input, {
      userName: 'Website Visitor',
      userId: 'web-user-' + Date.now()
    });
    
    setInput('');
  };

  return (
    <div className={`eliza-chat-widget ${className}`}>
      <div className="chat-messages">
        {messages.map(message => (
          <div 
            key={message.id} 
            className={`message ${message.isUser ? 'user' : 'agent'}`}
          >
            <strong>{message.author}:</strong> {message.content}
          </div>
        ))}
        {loading && <div className="loading">Agent is thinking...</div>}
        {error && <div className="error">Error: {error}</div>}
      </div>
      
      <form onSubmit={handleSubmit} className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
};

// Client-side rate limiting (backup to nginx rate limiting)
export const useRateLimit = (maxRequests = 8, windowMs = 60000) => {
  const [requests, setRequests] = useState([]);
  const [rateLimitError, setRateLimitError] = useState(null);

  const isAllowed = useCallback(() => {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Filter out old requests
    const recentRequests = requests.filter(time => time > windowStart);
    
    if (recentRequests.length >= maxRequests) {
      setRateLimitError(`Rate limit exceeded. Please wait ${Math.ceil((recentRequests[0] + windowMs - now) / 1000)} seconds.`);
      return false;
    }

    // Add current request
    setRequests([...recentRequests, now]);
    setRateLimitError(null);
    return true;
  }, [requests, maxRequests, windowMs]);

  const getRemainingRequests = useCallback(() => {
    const now = Date.now();
    const windowStart = now - windowMs;
    const recentRequests = requests.filter(time => time > windowStart);
    return Math.max(0, maxRequests - recentRequests.length);
  }, [requests, maxRequests, windowMs]);

  const getTimeUntilReset = useCallback(() => {
    const now = Date.now();
    const windowStart = now - windowMs;
    const recentRequests = requests.filter(time => time > windowStart);
    
    if (recentRequests.length === 0) return 0;
    return Math.max(0, recentRequests[0] + windowMs - now);
  }, [requests, windowMs]);

  return { 
    isAllowed, 
    getRemainingRequests, 
    getTimeUntilReset,
    rateLimitError 
  };
};

export default ElizaAPIClient;

// Production Usage Examples
export const ProductionExamples = {
  // Basic usage with default settings
  basic: () => (
    <ElizaChatWidget 
      agentId="3c0b933c-a2c6-06f9-abdc-dbd48eb48314"
      className="my-chat-widget"
    />
  ),

  // Custom configuration
  custom: () => (
    <ElizaChatWidget 
      agentId="3c0b933c-a2c6-06f9-abdc-dbd48eb48314"
      className="custom-chat"
      apiKey="n13in13kfdjn13irju1i3d1i3d"
    />
  ),

  // With custom hook usage
  customHook: () => {
    const { messages, sendMessage, loading, error } = useElizaChat(
      "3c0b933c-a2c6-06f9-abdc-dbd48eb48314",
      {
        baseURL: 'https://webchat.withseren.com',
        apiKey: 'n13in13kfdjn13irju1i3d1i3d'
      }
    );

    return (
      <div className="custom-chat-interface">
        {/* Your custom UI here */}
        <div className="messages">
          {messages.map(msg => (
            <div key={msg.id} className={msg.isUser ? 'user' : 'agent'}>
              {msg.content}
            </div>
          ))}
        </div>
        <button 
          onClick={() => sendMessage('Hello!')}
          disabled={loading}
        >
          {loading ? 'Sending...' : 'Send Hello'}
        </button>
        {error && <div className="error">{error}</div>}
      </div>
    );
  }
};

// CSS Styles for the chat widget
export const ChatWidgetStyles = `
.eliza-chat-widget {
  max-width: 400px;
  height: 500px;
  border: 1px solid #ddd;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: #f9f9f9;
}

.message {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 12px;
  max-width: 80%;
}

.message.user {
  background: #007bff;
  color: white;
  margin-left: auto;
  text-align: right;
}

.message.agent {
  background: white;
  border: 1px solid #e0e0e0;
}

.chat-input {
  display: flex;
  padding: 16px;
  border-top: 1px solid #ddd;
  background: white;
}

.chat-input input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 20px;
  outline: none;
  margin-right: 8px;
}

.chat-input button {
  padding: 8px 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 20px;
  cursor: pointer;
}

.chat-input button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.loading {
  text-align: center;
  color: #666;
  font-style: italic;
  padding: 8px;
}

.error {
  background: #fee;
  color: #c33;
  padding: 8px;
  border-radius: 4px;
  margin: 8px 0;
  border: 1px solid #fcc;
}
`;