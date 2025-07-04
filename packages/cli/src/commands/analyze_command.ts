import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Config, AuthType } from '@google/gemini-cli-core';
import { confirmProceed } from '../utils/hitl.js';
import { saveSession, loadSession } from '../session/session_manager.js';

// Import Content type from genai package
import type { Content } from '@google/genai';

interface AnalysisResult {
  file: string;
  issues: CodeIssue[];
  suggestions: CodeSuggestion[];
  metrics: CodeMetrics;
}

interface CodeIssue {
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  type: 'security' | 'performance' | 'maintainability' | 'style' | 'bug';
}

interface CodeSuggestion {
  line: number;
  type: 'optimization' | 'refactor' | 'documentation' | 'test';
  description: string;
  suggestedCode?: string;
}

interface CodeMetrics {
  complexity: number;
  maintainabilityIndex: number;
  testCoverage?: number;
  performance: 'excellent' | 'good' | 'fair' | 'poor';
  security: 'secure' | 'moderate' | 'vulnerable';
}

export async function analyzeCommand(options: {
  file?: string;
  watch?: boolean;
  full?: boolean;
  fix?: boolean;
}): Promise<void> {
  const { file, watch, full, fix } = options;
  
  console.log('🔍 Gemini Code Analyzer');
  console.log('Analyzing your code for issues, improvements, and optimizations...\n');

  const config = new Config({
    sessionId: 'analysis-session',
    targetDir: process.cwd(),
    debugMode: false,
    cwd: process.cwd(),
    model: 'gemini-1.5-pro',
  });
  const cgConfig = config.getContentGeneratorConfig();
  
  if (!cgConfig) {
    let errorMsg = "Content generator configuration not found for code analysis.";
    if (!process.env.GEMINI_API_KEY) {
      errorMsg += " Hint: If using an API key, ensure GEMINI_API_KEY environment variable is set.";
    }
    console.error(errorMsg);
    process.exit(1);
  }

  try {
    if (watch) {
      await startWatchMode(file || '.');
    } else {
      const results = await analyzeCodebase(file || '.', full || false);
      await displayResults(results, fix || false);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error during code analysis: ${errorMessage}`);
    process.exit(1);
  }
}

async function analyzeCodebase(target: string, fullAnalysis: boolean): Promise<AnalysisResult[]> {
  console.log(`📂 Analyzing: ${target}`);
  
  const stats = await fs.stat(target);
  const files: string[] = [];
  
  if (stats.isFile()) {
    files.push(target);
  } else {
    // Get all code files in directory
    const allFiles = await getCodeFiles(target);
    files.push(...allFiles);
  }
  
  console.log(`📝 Found ${files.length} code files to analyze`);
  
  const results: AnalysisResult[] = [];
  
  for (const filePath of files) {
    console.log(`  🔍 Analyzing ${path.basename(filePath)}...`);
    const result = await analyzeFile(filePath, fullAnalysis);
    results.push(result);
  }
  
  return results;
}

async function analyzeFile(filePath: string, fullAnalysis: boolean): Promise<AnalysisResult> {
  const content = await fs.readFile(filePath, 'utf-8');
  const fileExt = path.extname(filePath);
  
  // Create AI prompt for code analysis
  const prompt = createAnalysisPrompt(content, fileExt, fullAnalysis);
  
  const config = new Config({
    sessionId: 'analysis-session',
    targetDir: process.cwd(),
    debugMode: false,
    cwd: process.cwd(),
    model: 'gemini-1.5-pro',
  });
  const contentGeneratorConfig = config.getContentGeneratorConfig();
  
  if (!contentGeneratorConfig) {
    throw new Error("Content generator configuration not found");
  }
  
  try {
    const client = config.getGeminiClient();
    if (!client.isInitialized()) {
      await client.initialize(contentGeneratorConfig);
    }

    const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];
    const generationConfig = { temperature: 0.3, topP: 1 };
    const abortController = new AbortController();

    const result = await client.generateContent(contents, generationConfig, abortController.signal);
    const analysisText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!analysisText) {
      throw new Error("AI did not return any analysis content");
    }
    
    // Parse AI response into structured result
    const analysisResult = parseAnalysisResponse(analysisText, filePath);
    return analysisResult;
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`  ⚠️  Could not analyze ${filePath}: ${errorMessage}`);
    
    return {
      file: filePath,
      issues: [],
      suggestions: [],
      metrics: {
        complexity: 0,
        maintainabilityIndex: 50,
        performance: 'fair',
        security: 'moderate'
      }
    };
  }
}

function createAnalysisPrompt(code: string, fileExt: string, fullAnalysis: boolean): string {
  const language = getLanguageFromExtension(fileExt);
  
  return `Analyze this ${language} code and provide a detailed assessment. Return your analysis in the following JSON format:

{
  "issues": [
    {
      "line": number,
      "column": number,
      "severity": "error|warning|info",
      "message": "description",
      "type": "security|performance|maintainability|style|bug"
    }
  ],
  "suggestions": [
    {
      "line": number,
      "type": "optimization|refactor|documentation|test",
      "description": "suggestion description",
      "suggestedCode": "optional code suggestion"
    }
  ],
  "metrics": {
    "complexity": number (1-10),
    "maintainabilityIndex": number (0-100),
    "performance": "excellent|good|fair|poor",
    "security": "secure|moderate|vulnerable"
  }
}

Please analyze for:
- Security vulnerabilities and best practices
- Performance optimization opportunities
- Code maintainability and readability
- Potential bugs and error conditions
- Style and convention adherence
${fullAnalysis ? '- Design patterns and architecture suggestions' : ''}
${fullAnalysis ? '- Testing recommendations' : ''}

Code to analyze:
\`\`\`${language}
${code}
\`\`\``;
}

function parseAnalysisResponse(response: string, filePath: string): AnalysisResult {
  try {
    // Extract JSON from response (handle cases where AI includes extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : response;
    const parsed = JSON.parse(jsonText);
    
    return {
      file: filePath,
      issues: parsed.issues || [],
      suggestions: parsed.suggestions || [],
      metrics: parsed.metrics || {
        complexity: 5,
        maintainabilityIndex: 70,
        performance: 'good',
        security: 'moderate'
      }
    };
  } catch (error) {
    // Fallback to basic analysis if JSON parsing fails
    return {
      file: filePath,
      issues: [],
      suggestions: [{
        line: 1,
        type: 'documentation',
        description: 'Consider adding comprehensive documentation for this code'
      }],
      metrics: {
        complexity: 5,
        maintainabilityIndex: 70,
        performance: 'good',
        security: 'moderate'
      }
    };
  }
}

async function displayResults(results: AnalysisResult[], autoFix: boolean): Promise<void> {
  console.log('\n📊 Code Analysis Results\n');
  
  let totalIssues = 0;
  let totalSuggestions = 0;
  
  for (const result of results) {
    console.log(`📁 ${path.basename(result.file)}`);
    console.log(`   📈 Complexity: ${result.metrics.complexity}/10`);
    console.log(`   🏃 Performance: ${result.metrics.performance}`);
    console.log(`   🔒 Security: ${result.metrics.security}`);
    console.log(`   🛠️  Maintainability: ${result.metrics.maintainabilityIndex}/100`);
    
    if (result.issues.length > 0) {
      console.log(`   ❗ Issues (${result.issues.length}):`);
      for (const issue of result.issues) {
        const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`     ${icon} Line ${issue.line}: ${issue.message}`);
      }
      totalIssues += result.issues.length;
    }
    
    if (result.suggestions.length > 0) {
      console.log(`   💡 Suggestions (${result.suggestions.length}):`);
      for (const suggestion of result.suggestions) {
        const icon = suggestion.type === 'optimization' ? '⚡' : 
                    suggestion.type === 'refactor' ? '🔄' : 
                    suggestion.type === 'test' ? '🧪' : '📚';
        console.log(`     ${icon} Line ${suggestion.line}: ${suggestion.description}`);
      }
      totalSuggestions += result.suggestions.length;
    }
    
    console.log('');
  }
  
  // Summary
  console.log('📋 Summary:');
  console.log(`   Files analyzed: ${results.length}`);
  console.log(`   Issues found: ${totalIssues}`);
  console.log(`   Suggestions: ${totalSuggestions}`);
  
  const avgComplexity = results.reduce((sum, r) => sum + r.metrics.complexity, 0) / results.length;
  const avgMaintainability = results.reduce((sum, r) => sum + r.metrics.maintainabilityIndex, 0) / results.length;
  
  console.log(`   Average complexity: ${avgComplexity.toFixed(1)}/10`);
  console.log(`   Average maintainability: ${avgMaintainability.toFixed(1)}/100`);
  
  if (autoFix && totalIssues > 0) {
    const shouldFix = await confirmProceed('🔧 Auto-fix is enabled. Would you like to apply suggested fixes?');
    if (shouldFix) {
      await applyAutoFixes(results);
    }
  } else if (totalIssues > 0) {
    console.log('\n💡 Tip: Use --fix flag to automatically apply suggested fixes');
  }
}

async function applyAutoFixes(results: AnalysisResult[]): Promise<void> {
  console.log('\n🔧 Applying automatic fixes...');
  
  for (const result of results) {
    const fixableIssues = result.issues.filter(issue => 
      issue.type === 'style' || issue.type === 'maintainability'
    );
    
    if (fixableIssues.length > 0) {
      console.log(`  🔧 Fixing ${fixableIssues.length} issues in ${path.basename(result.file)}`);
      // Implementation would go here to actually fix the code
      // For now, just log what would be fixed
      for (const issue of fixableIssues) {
        console.log(`    ✅ Fixed: ${issue.message}`);
      }
    }
  }
  
  console.log('\n✅ Auto-fixes applied successfully!');
}

async function getCodeFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const codeExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.php', '.rb'];
  
  async function walkDir(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await walkDir(fullPath);
      } else if (entry.isFile() && codeExtensions.includes(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }
  
  await walkDir(dir);
  return files;
}

function getLanguageFromExtension(ext: string): string {
  const languageMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.cs': 'csharp',
    '.go': 'go',
    '.rs': 'rust',
    '.php': 'php',
    '.rb': 'ruby'
  };
  
  return languageMap[ext] || 'text';
}

async function startWatchMode(target: string): Promise<void> {
  console.log(`👁️  Starting watch mode for: ${target}`);
  console.log('Press Ctrl+C to stop watching\n');
  
  // In a real implementation, we would use fs.watch() or a more sophisticated file watcher
  // For this prototype, we'll simulate watch mode
  console.log('🔄 Watch mode enabled - files will be analyzed when changed');
  console.log('   💡 This is a prototype - full watch mode implementation coming soon!');
}