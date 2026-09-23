export const fetchWithProxy = (input: string | URL, init?: RequestInit): Promise<Response> => {
  return fetch(input, init);
};

export const testNetworkProxy = async (): Promise<boolean> => {
  return true;
};
