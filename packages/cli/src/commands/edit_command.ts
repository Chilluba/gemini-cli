import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Config, AuthType } from '@google/gemini-cli-core';
import { confirmProceed } from '../utils/hitl.js';
import { saveSession } from '../session/session_manager.js';

// Import Content type from genai package
import type { Content } from '@google/genai';

interface EditSuggestion {
  originalLines: string[];
  suggestedLines: string[];
  startLine: number;
  endLine: number;
  reasoning: string;
  confidence: number;
}

interface FileAnalysis {
  language: string;
  complexity: number;
  suggestions: EditSuggestion[];
  risks: string[];
  dependencies: string[];
}

export async function handleEditCommand(
  filePath: string, 
  prompt: string, 
  options: {
    dryRun?: boolean;
    backup?: boolean;
    autoApply?: boolean;
    context?: string[];
  } = {}
): Promise<void> {
  console.log('🛠️  Gemini File Editor');
  console.log(`Analyzing and editing: ${filePath}`);
  console.log(`Edit request: ${prompt}\n`);

  // Validate file exists
  try {
    await fs.access(filePath);
  } catch {
    console.error(`❌ Error: File "${filePath}" not found.`);
    process.exit(1);
  }

  // Read current file content
  const currentContent = await fs.readFile(filePath, 'utf-8');
  const lines = currentContent.split('\n');

  // Create backup if requested
  if (options.backup !== false) {
    const backupPath = `${filePath}.backup.${Date.now()}`;
    await fs.writeFile(backupPath, currentContent);
    console.log(`📁 Created backup: ${backupPath}`);
  }

  // Analyze file and generate suggestions
  const analysis = await analyzeAndGenerateEdits(filePath, currentContent, prompt, options.context);

  if (analysis.suggestions.length === 0) {
    console.log('ℹ️  No changes suggested for this file.');
    return;
  }

  // Display suggestions
  console.log('\n🔍 Analysis Results:');
  console.log(`Language: ${analysis.language}`);
  console.log(`Complexity: ${analysis.complexity}/10`);
  
  if (analysis.risks.length > 0) {
    console.log('\n⚠️  Potential Risks:');
    analysis.risks.forEach(risk => console.log(`  • ${risk}`));
  }

  if (analysis.dependencies.length > 0) {
    console.log('\n🔗 Dependencies Affected:');
    analysis.dependencies.forEach(dep => console.log(`  • ${dep}`));
  }

  console.log('\n✨ Suggested Changes:');
  
  for (let i = 0; i < analysis.suggestions.length; i++) {
    const suggestion = analysis.suggestions[i];
    
    console.log(`\n--- Change ${i + 1} (Lines ${suggestion.startLine}-${suggestion.endLine}) ---`);
    console.log(`Confidence: ${suggestion.confidence}%`);
    console.log(`Reasoning: ${suggestion.reasoning}\n`);
    
    // Show diff
    console.log('🔴 Current:');
    suggestion.originalLines.forEach((line, idx) => {
      console.log(`${(suggestion.startLine + idx).toString().padStart(4, ' ')}: ${line}`);
    });
    
    console.log('\n🟢 Suggested:');
    suggestion.suggestedLines.forEach((line, idx) => {
      console.log(`${(suggestion.startLine + idx).toString().padStart(4, ' ')}: ${line}`);
    });
  }

  // Dry run mode
  if (options.dryRun) {
    console.log('\n🏃 Dry run mode - no changes applied.');
    return;
  }

  // Auto-apply or confirm
  let shouldApply = options.autoApply || false;
  
  if (!shouldApply) {
    shouldApply = await confirmProceed(
      '\n🤔 Apply these changes to the file? (This will modify the original file. Make sure you have backups.) [Y/n]'
    );
  }

  if (shouldApply) {
    const modifiedContent = applyEdits(lines, analysis.suggestions);
    await fs.writeFile(filePath, modifiedContent);
    
    console.log('\n✅ Changes applied successfully!');
    console.log(`📝 Modified ${analysis.suggestions.length} section(s) in ${filePath}`);
    
    // Save to session for tracking
    await saveSession('spec.md', 'tasks.json');
  } else {
    console.log('\n❌ Changes cancelled by user.');
  }
}

async function analyzeAndGenerateEdits(
  filePath: string,
  content: string,
  prompt: string,
  contextFiles?: string[]
): Promise<FileAnalysis> {
  const config = new Config({
    sessionId: 'edit-session',
    targetDir: process.cwd(),
    debugMode: false,
    cwd: process.cwd(),
    model: 'gemini-1.5-pro',
  });

  const contentGeneratorConfig = config.getContentGeneratorConfig();
  
  if (!contentGeneratorConfig) {
    throw new Error("Content generator configuration not found");
  }

  // Determine file language
  const fileExt = path.extname(filePath);
  const language = getLanguageFromExtension(fileExt);

  // Build context
  let contextContent = '';
  if (contextFiles && contextFiles.length > 0) {
    for (const contextFile of contextFiles) {
      try {
        const contextFileContent = await fs.readFile(contextFile, 'utf-8');
        contextContent += `\n--- Context: ${contextFile} ---\n${contextFileContent}\n`;
      } catch {
        console.warn(`⚠️  Could not read context file: ${contextFile}`);
      }
    }
  }

  const analysisPrompt = `
You are an expert ${language} developer. Analyze this file and provide specific editing suggestions.

File: ${filePath}
Edit Request: ${prompt}

Current Code:
\`\`\`${language}
${content}
\`\`\`

${contextContent ? `Context Files:${contextContent}` : ''}

Please provide your analysis in this JSON format:
{
  "language": "${language}",
  "complexity": 1-10,
  "suggestions": [
    {
      "originalLines": ["line1", "line2"],
      "suggestedLines": ["new_line1", "new_line2"],
      "startLine": 5,
      "endLine": 6,
      "reasoning": "Why this change is needed",
      "confidence": 85
    }
  ],
  "risks": ["potential risk 1", "potential risk 2"],
  "dependencies": ["file1.js", "module2"]
}

Focus on:
1. Implementing the requested changes accurately
2. Maintaining code style and conventions
3. Ensuring backward compatibility where possible
4. Highlighting any potential breaking changes
5. Suggesting improvements for code quality

Provide specific line-by-line edits with high confidence scores only.
`;

  try {
    const client = config.getGeminiClient();
    const contents: Content[] = [{ role: 'user', parts: [{ text: analysisPrompt }] }];
    
    const generationConfig = {
      temperature: 0.3, // Lower temperature for more consistent code suggestions
      maxOutputTokens: 8192,
    };

    const abortController = new AbortController();
    
    const result = await client.generateContent(contents, generationConfig, abortController.signal);
    const analysisText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!analysisText) {
      throw new Error("AI did not return any analysis content");
    }

    // Parse AI response
    const cleanedResponse = analysisText.replace(/```json\n?|\n?```/g, '').trim();
    const analysis: FileAnalysis = JSON.parse(cleanedResponse);
    
    // Validate suggestions
    analysis.suggestions = analysis.suggestions.filter(s => 
      s.confidence >= 70 && 
      s.originalLines.length > 0 && 
      s.suggestedLines.length > 0
    );

    return analysis;

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error analyzing file:', errorMessage);
    
    // Return minimal analysis on error
    return {
      language,
      complexity: 5,
      suggestions: [],
      risks: ['Analysis failed - manual review recommended'],
      dependencies: []
    };
  }
}

function getLanguageFromExtension(ext: string): string {
  const languageMap: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.go': 'go',
    '.rs': 'rust',
    '.php': 'php',
    '.rb': 'ruby',
    '.cs': 'csharp',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.sh': 'bash',
    '.md': 'markdown',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.xml': 'xml'
  };

  return languageMap[ext.toLowerCase()] || 'text';
}

function applyEdits(lines: string[], suggestions: EditSuggestion[]): string {
  // Sort suggestions by startLine in descending order to avoid line number shifting
  const sortedSuggestions = [...suggestions].sort((a, b) => b.startLine - a.startLine);
  
  let modifiedLines = [...lines];
  
  for (const suggestion of sortedSuggestions) {
    const { startLine, endLine, suggestedLines } = suggestion;
    
    // Convert to 0-based indexing
    const startIdx = startLine - 1;
    const endIdx = endLine - 1;
    
    // Validate line numbers
    if (startIdx >= 0 && endIdx < modifiedLines.length && startIdx <= endIdx) {
      // Replace the lines
      modifiedLines.splice(startIdx, endIdx - startIdx + 1, ...suggestedLines);
    }
  }
  
  return modifiedLines.join('\n');
}

// Enhanced version with git integration
export async function handleEditWithGit(
  filePath: string,
  prompt: string,
  options: {
    createBranch?: string;
    commitMessage?: string;
    pushRemote?: boolean;
  } = {}
): Promise<void> {
  const { createBranch, commitMessage, pushRemote } = options;
  
  if (createBranch) {
    const { execSync } = await import('child_process');
    try {
      execSync(`git checkout -b ${createBranch}`, { stdio: 'inherit' });
      console.log(`🌟 Created and switched to branch: ${createBranch}`);
    } catch (error) {
      console.error('❌ Failed to create branch:', error);
      return;
    }
  }
  
  // Perform the edit
  await handleEditCommand(filePath, prompt, { backup: true });
  
  if (commitMessage) {
    try {
      const { execSync } = await import('child_process');
      execSync(`git add ${filePath}`, { stdio: 'inherit' });
      execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
      console.log(`📝 Committed changes: ${commitMessage}`);
      
      if (pushRemote) {
        execSync(`git push origin ${createBranch || 'HEAD'}`, { stdio: 'inherit' });
        console.log('🚀 Pushed changes to remote repository');
      }
    } catch (error) {
      console.error('❌ Failed to commit changes:', error);
    }
  }
}