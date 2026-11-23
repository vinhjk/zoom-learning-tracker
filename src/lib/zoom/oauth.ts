/**
 * Zoom Server-to-Server OAuth
 * Manages token acquisition and caching for Zoom API calls.
 */

interface ZoomToken {
  access_token: string;
  expires_at: number;
}

let cachedToken: ZoomToken | null = null;

export async function getZoomAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5-minute buffer)
  if (cachedToken && cachedToken.expires_at > Date.now() + 5 * 60 * 1000) {
    return cachedToken.access_token;
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error('Missing Zoom OAuth credentials');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoom OAuth failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.access_token;
}

/**
 * Fetch past meeting participants from Zoom API.
 */
export async function getZoomPastMeetingParticipants(
  meetingId: string,
  nextPageToken?: string
): Promise<{
  participants: ZoomParticipant[];
  next_page_token: string;
  total_records: number;
}> {
  const token = await getZoomAccessToken();

  const url = new URL(
    `https://api.zoom.us/v2/past_meetings/${encodeURIComponent(meetingId)}/participants`
  );
  url.searchParams.set('page_size', '300');
  if (nextPageToken) {
    url.searchParams.set('next_page_token', nextPageToken);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoom API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

export interface ZoomParticipant {
  id?: string;
  user_id?: string;
  name: string;
  user_email?: string;
  join_time: string;
  leave_time: string;
  duration: number;
  registrant_id?: string;
}

