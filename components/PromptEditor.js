import React from 'react';
import { 
  Accordion, 
  AccordionSummary, 
  AccordionDetails, 
  Typography,
  TextField,
  Button
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

/**
 * Component for editing prompt configuration (dev only)
 */
const PromptEditor = ({ 
  promptConfig, 
  onConfigChange, 
  onSave, 
  visible = process.env.NODE_ENV === 'development' 
}) => {
  if (!visible) return null;
  
  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>Edit Prompt Configuration</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <TextField
          label="Context Prompt"
          fullWidth
          multiline
          minRows={4}
          value={promptConfig.contextPrompt}
          onChange={(e) => onConfigChange({ 
            ...promptConfig, 
            contextPrompt: e.target.value 
          })}
          sx={{ mb: 2 }}
        />
        <TextField
          label="Main Topic Instruction"
          fullWidth
          multiline
          minRows={2}
          value={promptConfig.mainTopicInstruction}
          onChange={(e) => onConfigChange({ 
            ...promptConfig, 
            mainTopicInstruction: e.target.value 
          })}
          sx={{ mb: 2 }}
        />
        <Button variant="contained" onClick={onSave}>Save Prompt Config</Button>
      </AccordionDetails>
    </Accordion>
  );
};

export default PromptEditor;