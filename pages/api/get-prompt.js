export const config = {
  api: {
    bodyParser: true,
  },
};

import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const configPath = path.join(process.cwd(), 'promptConfig.json');
    const configFile = fs.readFileSync(configPath, 'utf8');
    res.status(200).json(JSON.parse(configFile));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read prompt configuration' });
  }
}
