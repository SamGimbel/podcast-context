// pages/api/spotify-token.js
import { config } from '../../config';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  try {
    const clientId = config.SPOTIFY_CLIENT_ID;
    const clientSecret = config.SPOTIFY_CLIENT_SECRET;
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${authString}`,
      },
      body: "grant_type=client_credentials"
    });
    
    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      res.status(500).json({ error: "Failed to obtain Spotify access token" });
      return;
    }
    res.status(200).json({ token: tokenData.access_token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
