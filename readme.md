# Podcast Context MVP

This MVP provides real-time context for podcasts by transcribing audio, generating context via OpenAI's ChatGPT API, and retrieving related Wikipedia articles. It uses Server-Sent Events (SSE) to update the front-end in real time.

## Features

- **Podcast Integration:** Input a podcast audio URL.
- **Real-Time Transcription Simulation:** Simulated segmentation (using dummy data) with placeholder for Vosk integration.
- **Context Generation:** Uses OpenAI ChatGPT API.
- **Wikipedia Integration:** Retrieves related articles via the MediaWiki API.
- **Real-Time Updates:** Uses SSE to push updates to the client.
- **Deployment:** Ready to deploy on Heroku.

## Setup Instructions

1. **Clone the Repository**

   ```bash
   git clone <repository-url>
   cd podcast-context-mvp
