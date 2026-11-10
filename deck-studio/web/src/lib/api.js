// Talks to the local Python server.
export async function api(path, body) {
  const opts = body === undefined ? { method: 'GET' } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  };
  let res;
  try {
    res = await fetch(path, opts);
  } catch (e) {
    throw new Error('Deck Studio\'s background program is not running. Start it again with "Start Deck Studio".');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok || (data && data.error)) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

export const get = (path) => api(path);
export const post = (path, body = {}) => api(path, body);
