const API = 'api/videos';

async function request(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      if (data.error) message = data.error;
    } catch {
      // Body not JSON; keep the status message.
    }
    throw new Error(message);
  }
  return response;
}

export function videoUrl(name) {
  return `/output/${encodeURIComponent(name)}`;
}

export async function listVideos() {
  const response = await request(API, { cache: 'no-store' });
  return response.json();
}

export async function saveVideo(video) {
  const response = await request(API, {
    method: 'POST',
    headers: {
      'Content-Type': video.blob.type || 'video/mp4',
      'X-Filename': video.name,
    },
    body: video.blob,
  });
  return response.json();
}

export async function removeVideo(name) {
  await request(`${API}/${encodeURIComponent(name)}`, { method: 'DELETE' });
}
