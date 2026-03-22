import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { OpenRouter } from '@openrouter/sdk';
import { SettingsModel } from '../database/models.js';

class AIProvider {
  constructor() {
    this.client = null;
    this.provider = null;
  }

  async getClient() {
    const settings = await SettingsModel.get();
    this.provider = settings.ai_provider || 'openai';
    
    switch (this.provider) {
      case 'openai':
        this.client = new OpenAI({ apiKey: settings.ai_api_key });
        break;
      case 'groq':
        this.client = new Groq({ apiKey: settings.ai_api_key });
        break;
      case 'gemini':
        this.client = new GoogleGenerativeAI(settings.ai_api_key);
        break;
      case 'anthropic':
        this.client = new Anthropic({ apiKey: settings.ai_api_key });
        break;
      case 'openrouter':
        this.client = new OpenRouter({ apiKey: settings.ai_api_key });
        break;
      case 'custom':
        let customEndpoint = settings.custom_ai_endpoint || '';
        
        // Remove trailing slash if present
        if (customEndpoint.endsWith('/')) customEndpoint = customEndpoint.slice(0, -1);
        
        // If user accidentally glued the full endpoint instead of the base URL, remove it
        // e.g., "https://api.mulerun.com/v1/chat/completions" -> "https://api.mulerun.com/v1"
        if (customEndpoint.endsWith('/chat/completions')) {
          customEndpoint = customEndpoint.replace(/\/chat\/completions$/, '');
        }

        // Auto-correct missing /v1 for common local AI servers (Ollama, LM Studio)
        if ((customEndpoint.includes(':11434') || customEndpoint.includes(':1234')) && !customEndpoint.endsWith('/v1') && !customEndpoint.endsWith('/api')) {
          customEndpoint += '/v1';
        }

        this.client = new OpenAI({ 
          apiKey: settings.ai_api_key || 'empty', 
          baseURL: customEndpoint || undefined
        });
        break;
      case 'ollama':
        this.client = {
          baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
          model: settings.ai_model || 'llama2'
        };
        break;
      default:
        throw new Error(`Unsupported AI provider: ${this.provider}`);
    }
    
    return this.client;
  }

  async generateSummary(emailContent, systemInstructions) {
    try {
      const settings = await SettingsModel.get();
      const client = await this.getClient();
      const model = settings.ai_model || this.getDefaultModel();

      const prompt = `${systemInstructions}\n\nSummarize this email:\n\n${emailContent}`;

      let output = '';
      switch (this.provider) {
        case 'custom':
        case 'openai':
          const openaiResponse = await client.chat.completions.create({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500
          });
          output = openaiResponse.choices[0].message.content;
          break;

        case 'groq':
          const groqResponse = await client.chat.completions.create({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500
          });
          output = groqResponse.choices[0].message.content;
          break;

        case 'gemini':
          {
            const geminiModel = client.getGenerativeModel({ model });
            const geminiResult = await geminiModel.generateContent(prompt);
            output = geminiResult.response.text();
          }
          break;

        case 'anthropic':
          const anthropicResponse = await client.messages.create({
            model: model,
            max_tokens: 500,
            messages: [{ role: 'user', content: prompt }]
          });
          output = anthropicResponse.content[0].text;
          break;

        case 'openrouter':
          const openrouterResponse = await client.chat.completions.create({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500
          });
          output = openrouterResponse.choices[0].message.content;
          break;

        case 'ollama':
          const ollamaResponse = await fetch(`${client.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: client.model,
              prompt: prompt,
              stream: false
            })
          });
          const ollamaData = await ollamaResponse.json();
          output = ollamaData.response;
          break;

        default:
          throw new Error(`Unsupported AI provider: ${this.provider}`);
      }
      return this.cleanResponse(output);
    } catch (error) {
      console.error('AI summary error:', error.message);
      if (this.provider === 'custom' && error.status === 404) {
        throw new Error(`Custom AI Endpoint 404 Error: The '/chat/completions' route was not found on your server. \nSolution: Make sure your Custom Endpoint URL ends with '/v1' (e.g., http://localhost:11434/v1 for Ollama) and that the model name is correct.`);
      }
      throw error;
    }
  }

  // Removes thinking blocks like <think>...</think> often outputted by models like DeepSeek
  cleanResponse(text) {
    if (!text) return '';
    return text.replace(/<think>[\s\S]*?<\/think>\n?/gi, '').trim();
  }

  async generateReply(emailContent, systemInstructions, template = null) {
    try {
      const settings = await SettingsModel.get();
      const client = await this.getClient();
      const model = settings.ai_model || this.getDefaultModel();

      let prompt = `${systemInstructions}\n\nGenerate a reply to this email:\n\n${emailContent}`;
      
      if (template) {
        prompt += `\n\nUse this template/context: ${template}`;
      }

      let output = '';
      switch (this.provider) {
        case 'custom':
        case 'openai':
          const openaiResponse = await client.chat.completions.create({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1000
          });
          output = openaiResponse.choices[0].message.content;
          break;

        case 'groq':
          const groqResponse = await client.chat.completions.create({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1000
          });
          output = groqResponse.choices[0].message.content;
          break;

        case 'gemini':
          {
            const geminiModel = client.getGenerativeModel({ model });
            const geminiResult = await geminiModel.generateContent(prompt);
            output = geminiResult.response.text();
          }
          break;

        case 'anthropic':
          const anthropicResponse = await client.messages.create({
            model: model,
            max_tokens: 1000,
            messages: [{ role: 'user', content: prompt }]
          });
          output = anthropicResponse.content[0].text;
          break;

        case 'openrouter':
          const openrouterResponse = await client.chat.completions.create({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1000
          });
          output = openrouterResponse.choices[0].message.content;
          break;

        case 'ollama':
          const ollamaResponse = await fetch(`${client.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: client.model,
              prompt: prompt,
              stream: false
            })
          });
          const ollamaData = await ollamaResponse.json();
          output = ollamaData.response;
          break;

        default:
          throw new Error(`Unsupported AI provider: ${this.provider}`);
      }
      return this.cleanResponse(output);
    } catch (error) {
      console.error('AI reply generation error:', error.message);
      if (this.provider === 'custom' && error.status === 404) {
        throw new Error(`Custom AI Endpoint 404 Error: The '/chat/completions' route was not found on your server. \nSolution: Make sure your Custom Endpoint URL ends with '/v1' (e.g., http://localhost:11434/v1 for Ollama) and that the model name is correct.`);
      }
      throw error;
    }
  }

  async generateChatResponse(userMessage, systemInstructions) {
    try {
      const settings = await SettingsModel.get();
      const client = await this.getClient();
      const model = settings.ai_model || this.getDefaultModel();

      // For models that support System message separation
      const messages = [
        { role: 'system', content: systemInstructions },
        { role: 'user', content: userMessage }
      ];

      // Fallback combined prompt for models that don't nicely support system roles in basic APIs
      const combinedPrompt = `${systemInstructions}\n\nUser Message:\n${userMessage}`;

      let output = '';
      switch (this.provider) {
        case 'openai':
          const openaiResponse = await client.chat.completions.create({
            model: model,
            messages: messages,
            max_tokens: 1000
          });
          output = openaiResponse.choices[0].message.content;
          break;

        case 'custom':
          const customResponse = await client.chat.completions.create({
            model: model,
            messages: messages,
            max_tokens: 1000
          });
          output = customResponse.choices[0].message.content;
          break;

        case 'groq':
          const groqResponse = await client.chat.completions.create({
            model: model,
            messages: messages,
            max_tokens: 1000
          });
          output = groqResponse.choices[0].message.content;
          break;

        case 'gemini':
          {
            const geminiModel = client.getGenerativeModel({ model });
            const geminiResult = await geminiModel.generateContent({
              contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }]
            });
            output = geminiResult.response.text();
          }
          break;

        case 'anthropic':
          const anthropicResponse = await client.messages.create({
            model: model,
            system: systemInstructions,
            messages: [{ role: 'user', content: userMessage }],
            max_tokens: 1000
          });
          output = anthropicResponse.content[0].text;
          break;

        case 'openrouter':
          const openrouterResponse = await client.chat.completions.create({
            model: model,
            messages: messages,
            max_tokens: 1000
          });
          output = openrouterResponse.choices[0].message.content;
          break;

        case 'ollama':
          const ollamaResponse = await fetch(`${client.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: client.model,
              messages: [{ role: 'user', content: combinedPrompt }],
              stream: false
            })
          });
          const ollamaData = await ollamaResponse.json();
          output = ollamaData.message.content;
          break;

        default:
          throw new Error(`Unsupported AI provider: ${this.provider}`);
      }
      return this.cleanResponse(output);
    } catch (error) {
      console.error('AI chat generation error:', error.message);
      if (this.provider === 'custom' && error.status === 404) {
        throw new Error(`Custom AI Endpoint 404 Error: The '/chat/completions' route was not found on your server. \nSolution: Make sure your Custom Endpoint URL ends with '/v1' (e.g., http://localhost:11434/v1 for Ollama) and that the model name is correct.`);
      }
      throw error;
    }
  }

  getDefaultModel() {
    const models = {
      openai: 'gpt-5.4',
      groq: 'llama-3.3-70b-versatile',
      gemini: 'gemini-3.1-pro',
      anthropic: 'claude-4.6-sonnet',
      openrouter: 'openai/gpt-5.4',
      ollama: 'llama3.2'
    };
    return models[this.provider] || 'gpt-5.4';
  }

  async testConnection() {
    try {
      const client = await this.getClient();
      const settings = await SettingsModel.get();
      const model = settings.ai_model || this.getDefaultModel();

      switch (this.provider) {
        case 'custom':
        case 'openai':
          await client.chat.completions.create({
            model: model,
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 10
          });
          return true;

        case 'groq':
          await client.chat.completions.create({
            model: model,
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 10
          });
          return true;

        case 'gemini':
          {
            const geminiModel = client.getGenerativeModel({ model });
            await geminiModel.generateContent('Hello');
            return true;
          }

        case 'anthropic':
          await client.messages.create({
            model: model,
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Hello' }]
          });
          return true;

        case 'openrouter':
          await client.chat.completions.create({
            model: model,
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 10
          });
          return true;

        case 'ollama':
          const response = await fetch(`${client.baseUrl}/api/tags`);
          return response.ok;

        default:
          return false;
      }
    } catch (error) {
      console.error('AI connection test error:', error.message);
      return false;
    }
  }
}

export default new AIProvider();
