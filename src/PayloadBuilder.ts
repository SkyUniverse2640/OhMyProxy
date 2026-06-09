import { existsSync, readdirSync } from "fs";
import type { Settings, PostmanToolResponse } from "./types";

export class PayloadBuilder {
  private readonly settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  userQuery(query: string, cwd: string, workspaceId: string, conversationId?: string): any {
    const { clientTools, clientKBTerms } = this.buildClientTools();
    return {
      input: {
        chatType: "USER_QUERY",
        query,
        toolResponse: "",
        useCase: null,
        conversationId: conversationId ?? null,
        agent: null,
        product: "workspace_v12",
        startedFrom: "CHAT_INPUT",
      },
      platform: "DESKTOP_WINDOWS",
      clientTools,
      clientKBTerms,
      mandatoryContext: { workspaceId },
      selectedContext: [],
      backgroundContext: this.buildBackgroundContext(cwd, workspaceId),
      availableSkills: [],
      devModeOptions: this.buildDevModeOptions(),
    };
  }

  toolResponse(
    conversationId: string,
    toolCallGroupId: string,
    toolResponses: PostmanToolResponse[],
    cwd: string,
    workspaceId: string,
  ): any {
    const { clientTools, clientKBTerms } = this.buildClientTools();
    return {
      input: {
        chatType: "TOOL_RESPONSE",
        query: "",
        useCase: null,
        conversationId,
        product: "workspace_v12",
        toolCallGroupId,
        toolResponses,
      },
      platform: "DESKTOP_WINDOWS",
      clientTools,
      clientKBTerms,
      mandatoryContext: { workspaceId },
      selectedContext: [],
      backgroundContext: this.buildBackgroundContext(cwd, workspaceId),
      availableSkills: [],
      devModeOptions: this.buildDevModeOptions(),
    };
  }

  headers(token: string): Record<string, string> {
    const p = this.settings.postman;
    return {
      "content-type": "application/json",
      "accept": "*/*",
      "accept-language": "en-US",
      "x-access-token": token,
      "x-app-version": p.app_version,
      "x-entity-team-id": p.team_id,
      "x-pstmn-req-service": "agent-mode-service",
      "user-agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Postman/${p.app_version} Electron/37.10.3 Safari/537.36`,
    };
  }

  private buildClientTools() {
    const p = this.settings.postman;
    const b = p.ui_build;
    const toolsHash = `clienttools-workspace_v12-desktop-win32-${p.app_version}-ui-${b.date}-${b.time}-${b.tools_hash}`;
    const kbHash = `kbterms-workspace_v12-desktop-win32-${p.app_version}-ui-${b.date}-${b.time}-${b.kb_hash}`;
    return {
      clientTools: {
        nativeToolsHash: toolsHash,
        excludedTools: [
          "listDatasets","createDataset","previewDataset","queryDatasetView","deleteDataset",
          "getDatasetSchema","createDatasetView","deleteDatasetView","runQuery","insertDatasetRows",
          "modifyDatasetView","refreshDatasource","addDatasetSource","editDatasetSource",
          "removeDatasetSource","testDatasourceConnection","listCloudMocks","getCloudMock",
          "getCloudMockLogs","renameCloudMock","deleteCloudMock","checkMockSlugAvailability",
          "createCloudMock","listWorkspaceDocs","getWorkspaceDoc","createWorkspaceDoc",
          "updateWorkspaceDoc","deleteWorkspaceDoc","openBrowserPage","browserRunPlaywright","askUser",
        ],
        thirdParty: {},
      },
      clientKBTerms: { nativeTermsHash: kbHash, excludedKBTerms: ["DATASETS"] },
    };
  }

  private buildDevModeOptions() {
    return {
      selectedModel: this.settings.postman.model,
      isParallelToolCallingSupported: true,
      autoRun: false,
      supportsAskUser: false,
      supportsActionRecommendations: true,
      useThinkingModeIfAvailable: true,
      thinkingLevel: "medium",
    };
  }

  private buildBackgroundContext(cwd: string, workspaceId: string): any[] {
    const p = this.settings.postman;
    const overview = this.getProjectOverview(cwd);
    const cwdDisplay = cwd.replace(/\//g, "\\");
    return [
      { type: "ACTIVE_ENVIRONMENT", value: null },
      { type: "ACTIVE_WORKSPACE", value: {
        name: p.workspace_name ?? "My Workspace",
        id: workspaceId,
        userRole: "Admin",
      }},
      { type: "TAB_LIST", value: [{
        tabId: "8dc56c46-1234-4115-9c81-e39d32b62a85",
        isActive: true, entityType: "overview", entityId: "overview",
        tabTitle: "Overview", name: "Overview",
        isDirty: null, isPreview: false, isConflicted: false,
      }]},
      { type: "VARIABLES_IN_SCOPE", value: [] },
      { type: "ENVIRONMENT_LIST", value: [] },
      { type: "COLLECTION_LIST", value: [] },
      { type: "USER_METADATA", value: {
        role: "", domain: "a personal account",
        createdAt: "2026-04-20T09:50:33.000Z", teamIntent: "buildAndTestYourAPIs",
      }},
      { type: "FILE_VIEWER_FOLDER", value: {
        path: cwdDisplay,
        isOpen: true,
        platform: "desktop",
        description: `Selected folder: ${cwdDisplay}. All file operations will operate relative to this directory. Use paths like 'package.json', 'src/main.js', 'docs/README.md' relative to this location. Platform: desktop.`,
        projectOverview: overview,
      }},
      { type: "AGENTS_MD", value: { agentsMdFileContent: null } },
    ];
  }

  private getProjectOverview(cwd: string): any {
    try {
      if (!existsSync(cwd)) return null;
      const entries = readdirSync(cwd, { withFileTypes: true });
      return {
        rootPath: cwd,
        topLevelDirectories: entries.filter(e => e.isDirectory()).map(e => e.name),
        topLevelFiles: entries.filter(e => !e.isDirectory()).map(e => e.name),
        totalTopLevelItems: entries.length,
      };
    } catch { return null; }
  }
}
