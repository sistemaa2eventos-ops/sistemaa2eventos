const axios = require('axios');

class TurnstileHTTPAPI {
  constructor(ip, port = 8080, apiKey = null) {
    this.baseURL = `http://${ip}:${port}`;
    this.apiKey = apiKey;
  }

  async open(direction = 'in') {
    try {
      const response = await axios.post(`${this.baseURL}/api/open`, {
        direction,
        timestamp: new Date().toISOString()
      }, {
        headers: this.getHeaders(),
        timeout: 5000
      });
      
      return {
        success: true,
        data: response.data,
        message: 'Catraca liberada'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Erro ao liberar catraca'
      };
    }
  }

  async close() {
    try {
      const response = await axios.post(`${this.baseURL}/api/close`, {}, {
        headers: this.getHeaders(),
        timeout: 5000
      });
      
      return {
        success: true,
        data: response.data,
        message: 'Catraca bloqueada'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Erro ao bloquear catraca'
      };
    }
  }

  async getStatus() {
    try {
      const response = await axios.get(`${this.baseURL}/api/status`, {
        headers: this.getHeaders(),
        timeout: 3000
      });
      
      return {
        success: true,
        status: response.data.status,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        status: 'offline',
        error: error.message
      };
    }
  }

  async getCount() {
    try {
      const response = await axios.get(`${this.baseURL}/api/count`, {
        headers: this.getHeaders(),
        timeout: 3000
      });
      
      return {
        success: true,
        count: response.data.count
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        error: error.message
      };
    }
  }

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;
    return headers;
  }
}

module.exports = TurnstileHTTPAPI;
