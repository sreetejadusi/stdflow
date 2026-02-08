import * as vscode from "vscode";
import { FlowchartIR } from "../ir/ir";
import { analyzePythonCode, analyzePythonFileCode } from "./language-services/python";
import { analyzeTypeScriptCode, analyzeTypeScriptFileCode } from "./language-services/typescript";
import { analyzeJavaCode, analyzeJavaFileCode } from "./language-services/java";
import { analyzeCppCode, analyzeCppFileCode } from "./language-services/cpp";
import { analyzeCCode, analyzeCFileCode } from "./language-services/c";
import { analyzeRustCode, analyzeRustFileCode } from "./language-services/rust";
import { analyzeGoCode, analyzeGoFileCode } from "./language-services/go";

/**
 * Analyzes the given source code and generates a flowchart.
 * @param sourceCode - The source code to analyze.
 * @param languageId - The language identifier (e.g., 'python', 'typescript', etc.).
 * @param functionName - Optional function name to analyze specifically.
 * @param position - Optional position in the source code to analyze.
 * @returns A FlowchartIR representation of the code.
 */
export async function analyzeCode(
  sourceCode: string,
  languageId: string,
  functionName?: string,
  position?: number,
  scope: "function" | "file" = "function"
): Promise<FlowchartIR> {
  switch (languageId) {
    case "python":
      return scope === "file"
        ? await analyzePythonFileCode(sourceCode)
        : await analyzePythonCode(sourceCode, position || 0);
    case "typescript":
    case "javascript":
      return scope === "file"
        ? await analyzeTypeScriptFileCode(sourceCode)
        : await analyzeTypeScriptCode(sourceCode, position || 0);
    case "java":
      return scope === "file"
        ? await analyzeJavaFileCode(sourceCode)
        : await analyzeJavaCode(sourceCode, position || 0);
    case "cpp":
      return scope === "file"
        ? analyzeCppFileCode(sourceCode)
        : analyzeCppCode(sourceCode, functionName, position);
    case "c":
      return scope === "file"
        ? analyzeCFileCode(sourceCode)
        : analyzeCCode(sourceCode, functionName, position);
    case "rust":
      return scope === "file"
        ? analyzeRustFileCode(sourceCode)
        : analyzeRustCode(sourceCode, functionName, position);
    case "go":
      return scope === "file"
        ? analyzeGoFileCode(sourceCode)
        : analyzeGoCode(sourceCode, functionName, position);
    default:
      throw new Error(`Unsupported language: ${languageId}`);
  }
}
