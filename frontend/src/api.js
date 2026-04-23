import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

// Create an Axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiServices = {
  // Setup a new debate session
  startDebate: async (config) => {
    try {
      const response = await apiClient.post('/debate/start', config);
      return response.data;
    } catch (error) {
      console.error("Error starting debate:", error);
      throw error;
    }
  },

  // Fetch the post-debate report
  getReport: async (debateId) => {
    try {
      const response = await apiClient.get(`/debate/report/${debateId}`);
      return response.data;
    } catch (error) {
      console.error("Error fetching report:", error);
      throw error;
    }
  },
  
  // Fetch latest scores (if you choose to poll instead of WebSockets)
  getLatestScores: async (debateId) => {
      try {
          const response = await apiClient.get(`/debate/scores/${debateId}`);
          return response.data;
      } catch (error) {
          console.error("Error fetching scores:", error);
          throw error;
      }
  }
};