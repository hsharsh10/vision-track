import axios from "axios";
import { SearchRequest, SearchResponse, PopularCorridor, MLModelMetrics } from "../types";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/v1",
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

export const searchRoutes = async (req: SearchRequest): Promise<SearchResponse> => {
  const response = await api.post<SearchResponse>("/routes/search", req);
  return response.data;
};

export const getPopularCorridors = async (): Promise<PopularCorridor[]> => {
  const response = await api.get<PopularCorridor[]>("/routes/popular-corridors");
  return response.data;
};

export const getMLMetrics = async (): Promise<Record<string, MLModelMetrics>> => {
  const response = await api.get<Record<string, MLModelMetrics>>("/fares/models/metrics");
  return response.data;
};

export const getUserPreferences = async () => {
  const response = await api.get("/preferences");
  return response.data;
};

export const updateUserPreferences = async (prefs: any) => {
  const response = await api.post("/preferences", prefs);
  return response.data;
};
