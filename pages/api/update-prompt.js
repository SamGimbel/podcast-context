export const config = {
  api: {
    bodyParser: true,
  },
};

import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (process.env.NODE_ENV !== 'development') {
    res.status(403).json({ error: 'Not available in production' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { contextPrompt, mainTopicInstruction } = req.body;
    const configPath = path.join(process.cwd(), 'promptConfig.json');
    const newConfig = { contextPrompt, mainTopicInstruction };
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
    res.status(200).json({ message: 'Prompt configuration updated', config: newConfig });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update prompt configuration' });
  }
}
