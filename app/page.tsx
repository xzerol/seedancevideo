"use client";

import "@xyflow/react/dist/style.css";

import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance
} from "@xyflow/react";
import {
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  Video,
  Volume2,
  X
} from "lucide-react";
import {
  DragEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ReactNode } from "react";
import {
  insertMentionAtCursor,
  mentionQueryAtCursor,
  nextNodePosition
} from "@/lib/canvas";
import {
  generationProgress,
  generationStatusLabel,
  generationStatusMessage,
  type TaskLike
} from "@/lib/generation-status";

type Asset = {
  id: string;
  name: string;
  kind: string;
  libraryType: string;
  source: string;
  mimeType: string;
  publicUrl: string;
};

type ProjectSummary = {
  id: string;
  name: string;
  thumbnailUrl?: string | null;
  thumbnailKind?: string | null;
  assetCount?: number;
  generationCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

type GenerationJob = {
  id: string;
  nodeId?: string | null;
  type: string;
  prompt: string;
  status: string;
  resultUrl?: string | null;
  errorMessage?: string | null;
  createdAt: string;
};

type PreviewItem = {
  title: string;
  url: string;
  kind: string;
};

type ConversationSnapshot = {
  id: string;
  nodeId: string;
  nodeType: string;
  prompt: string;
  inputAssetIds: string;
  paramsJson: string;
  createdAt: string;
};

type GenerationBatchPayload = {
  id: string;
  status?: string | null;
  tasks?: TaskLike[];
};

type WorkflowNodeData = {
  [key: string]: any;
  title?: string;
  prompt?: string;
  assetId?: string;
  asset?: Asset;
  inputAssetIds?: string[];
  resultUrl?: string;
  resultKind?: "image" | "video";
  status?: string;
  errorMessage?: string;
  batchId?: string;
  tasks?: TaskLike[];
  statusMessage?: string;
  resultNodeId?: string;
  mode?: string;
  ratio?: string;
  resolution?: string;
  duration?: number;
  count?: number;
  generateAudio?: boolean;
  size?: "2K" | "3K";
  optimizePrompt?: boolean;
  watermark?: boolean;
};

const ratios = ["智能", "16:9", "9:16", "1:1", "4:3", "3:4"];
const nodeTypes = {
  asset: memo(ResourceNode),
  person: memo(ResourceNode),
  "result-image": memo(ResultNode),
  "result-video": memo(ResultNode),
  "seedream-image": memo(SeedreamNode),
  "seedance-video": memo(SeedanceNode),
  "bailian-video": memo(BailianVideoNode)
};

function isImage(asset?: Asset) {
  return asset?.kind === "image" || asset?.libraryType === "person";
}

function labelForType(type?: string) {
  if (type === "seedream-image") return "Seedream 5.0";
  if (type === "seedance-video") return "Seedance 2.0";
  if (type === "bailian-video") return "百炼视频";
  if (type === "person") return "人物角色";
  if (type === "result-video") return "视频结果";
  if (type === "result-image") return "图片结果";
  return "素材";
}

function ResourcePreview({
  asset,
  onOpen
}: {
  asset?: Asset;
  onOpen?: () => void;
}) {
  if (!asset) return <div className="thumb empty-thumb">素材</div>;
  const preview =
    isImage(asset) ? (
      <img className="thumb" src={asset.publicUrl} alt={asset.name} />
    ) : asset.kind === "video" ? (
      <video className="thumb" src={asset.publicUrl} muted />
    ) : (
      <div className="thumb empty-thumb">
        <Volume2 size={22} />
      </div>
    );

  if (onOpen) {
    return (
      <button
        className="thumb-action nodrag"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        {preview}
      </button>
    );
  }

  return preview;
}

function assetPreviewItem(asset: Asset): PreviewItem {
  return {
    title: asset.name,
    url: asset.publicUrl,
    kind: asset.kind
  };
}

function PreviewModal({
  item,
  onClose
}: {
  item: PreviewItem | null;
  onClose: () => void;
}) {
  if (!item) return null;
  const isVideo = item.kind === "video" || item.url.toLowerCase().includes(".mp4");
  return (
    <div className="preview-backdrop" onClick={onClose}>
      <div className="preview-modal" onClick={(event) => event.stopPropagation()}>
        <div className="preview-head">
          <strong>{item.title}</strong>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        {isVideo ? (
          <video className="preview-media" src={item.url} controls autoPlay />
        ) : (
          <img className="preview-media" src={item.url} alt={item.title} />
        )}
      </div>
    </div>
  );
}

function SourcePills({
  assets,
  onRemove,
  onPreview
}: {
  assets: Asset[];
  onRemove?: (id: string) => void;
  onPreview?: (asset: Asset) => void;
}) {
  if (assets.length === 0) return null;
  return (
    <div className="source-pills">
      {assets.map((asset) => (
        <span className="source-pill" key={asset.id}>
          <ResourcePreview
            asset={asset}
            onOpen={onPreview ? () => onPreview(asset) : undefined}
          />
          @{asset.name}
          {onRemove && (
            <button type="button" onClick={() => onRemove(asset.id)}>
              <Trash2 size={12} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

function PromptEditor({
  nodeId,
  data,
  placeholder
}: {
  nodeId: string;
  data: WorkflowNodeData & Record<string, any>;
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mention, setMention] = useState<{ query: string; start: number; end: number } | null>(
    null
  );
  const mentionAssets: Asset[] = data.mentionAssets || [];
  const candidates = mention
    ? mentionAssets
        .filter((asset) =>
          asset.name.toLowerCase().includes(mention.query.toLowerCase())
        )
        .slice(0, 8)
    : [];

  function syncMention(value: string, cursor: number) {
    setMention(mentionQueryAtCursor(value, cursor));
  }

  function chooseAsset(asset: Asset) {
    const current = data.prompt || "";
    const cursor = textareaRef.current?.selectionStart ?? current.length;
    const inserted = insertMentionAtCursor(current, cursor, asset.name);
    data.onMentionAsset?.(nodeId, asset.id, inserted.prompt);
    setMention(null);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(inserted.cursor, inserted.cursor);
    });
  }

  return (
    <div className="prompt-editor nodrag">
      <textarea
        ref={textareaRef}
        className="node-textarea"
        placeholder={placeholder}
        value={data.prompt || ""}
        onChange={(event) => {
          data.onPromptChange?.(nodeId, event.target.value);
          syncMention(event.target.value, event.target.selectionStart);
        }}
        onClick={(event) =>
          syncMention(data.prompt || "", event.currentTarget.selectionStart)
        }
        onKeyUp={(event) =>
          syncMention(event.currentTarget.value, event.currentTarget.selectionStart)
        }
      />
      {candidates.length > 0 && (
        <div className="mention-menu">
          {candidates.map((asset) => (
            <button key={asset.id} type="button" onClick={() => chooseAsset(asset)}>
              <ResourcePreview asset={asset} />
              <span>@{asset.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ResourceNode({ data, selected }: NodeProps<Node<WorkflowNodeData>>) {
  const asset = data.asset;
  return (
    <div
      className={`flow-node resource-node ${selected ? "selected" : ""}`}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        if (asset) data.onPreview?.(assetPreviewItem(asset));
      }}
    >
      <Handle className="node-port" type="source" position={Position.Right} />
      <button
        className="node-delete nodrag"
        type="button"
        aria-label="删除画布元素"
        onClick={() => data.onDeleteNode?.(data.nodeId)}
      >
        <Trash2 size={14} />
      </button>
      <ResourcePreview
        asset={asset}
        onOpen={asset ? () => data.onPreview?.(assetPreviewItem(asset)) : undefined}
      />
      <div>
        <strong>{asset?.name || data.title}</strong>
        <span>{labelForType(asset?.libraryType || asset?.kind)}</span>
      </div>
    </div>
  );
}

function ResultNode({ data, selected }: NodeProps<Node<WorkflowNodeData>>) {
  const isVideoResult =
    data.resultKind === "video" || data.resultUrl?.toLowerCase().includes(".mp4");
  return (
    <div className={`flow-node result-node ${selected ? "selected" : ""}`}>
      <Handle className="node-port" type="target" position={Position.Left} />
      <Handle className="node-port" type="source" position={Position.Right} />
      <div className="node-head">
        <strong>{data.title || "生成结果"}</strong>
        <span className="node-head-right">
          {data.status || "ready"}
          <button
            className="node-delete inline nodrag"
            type="button"
            aria-label="删除生成结果"
            onClick={() => data.onDeleteNode?.(data.nodeId)}
          >
            <Trash2 size={14} />
          </button>
        </span>
      </div>
      {data.resultUrl ? (
        isVideoResult ? (
          <video className="result-media" src={data.resultUrl} controls />
        ) : (
          <img
            className="result-media clickable-media"
            src={data.resultUrl}
            alt="生成结果"
            onClick={() =>
              data.onPreview?.({
                title: data.title || "生成结果",
                url: data.resultUrl,
                kind: "image"
              })
            }
          />
        )
      ) : (
        <p className="node-muted">{data.errorMessage || "等待生成结果"}</p>
      )}
      {data.resultUrl && (
        <div className="node-secondary-row nodrag">
          <button
            className="node-secondary"
            type="button"
            onClick={() =>
              data.onPreview?.({
                title: data.title || "生成结果",
                url: data.resultUrl,
                kind: data.resultKind || (isVideoResult ? "video" : "image")
              })
            }
          >
            <Maximize2 size={14} />
            放大
          </button>
          <button
            className="node-secondary"
            type="button"
            onClick={() => data.onCollect?.(data)}
          >
            收藏
          </button>
        </div>
      )}
    </div>
  );
}

function GeneratorShell({
  data,
  selected,
  icon,
  children
}: {
  data: WorkflowNodeData & Record<string, any>;
  selected: boolean;
  icon: ReactNode;
  children: React.ReactNode;
}) {
  const inputAssets: Asset[] = data.inputAssets || [];
  const progress = generationProgress(data.status, data.tasks || []);
  const showProgress = ["queued", "running", "failed", "canceled"].includes(
    String(data.status || "").toLowerCase()
  );
  return (
    <div className={`flow-node generator-node ${selected ? "selected" : ""}`}>
      <Handle className="node-port" type="target" position={Position.Left} />
      <Handle className="node-port" type="source" position={Position.Right} />
      <div className="node-head">
        <span className="node-title">
          {icon}
          {data.title}
        </span>
        <span className="node-head-right">
          {data.status ? generationStatusLabel(data.status) : "草稿"}
          <button
            className="node-delete inline nodrag"
            type="button"
            aria-label="删除生成卡片"
            onClick={() => data.onDeleteNode?.(data.nodeId)}
          >
            <Trash2 size={14} />
          </button>
        </span>
      </div>
      <SourcePills
        assets={inputAssets}
        onRemove={data.onRemoveInputAsset}
        onPreview={(asset) => data.onPreview?.(assetPreviewItem(asset))}
      />
      {showProgress && (
        <div className={`node-progress ${data.status === "failed" ? "failed" : ""}`}>
          <div className="node-progress-meta">
            <span>{data.statusMessage || generationStatusMessage(data.status, data.tasks || [])}</span>
            <strong>{progress}%</strong>
          </div>
          <div className="node-progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
          {(data.tasks || []).length > 0 && (
            <div className="task-strip">
              {(data.tasks || []).map((task: TaskLike, index: number) => (
                <span
                  key={`${task.status}-${index}`}
                  className={`task-dot ${task.videoUrl || task.status === "completed" ? "done" : ""} ${
                    task.errorMessage || task.status === "failed" ? "failed" : ""
                  }`}
                  title={`视频 ${index + 1}: ${generationStatusLabel(task.status)}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {children}
      <div className="node-draft-actions nodrag">
        <button type="button" onClick={() => data.onSaveConversation?.(data.nodeId)}>
          保存对话
        </button>
        <select
          value=""
          onFocus={() => data.onLoadConversations?.(data.nodeId)}
          onChange={(event) => {
            if (event.target.value) data.onRestoreConversation?.(data.nodeId, event.target.value);
          }}
        >
          <option value="">历史版本</option>
          {(data.conversationSnapshots || []).map((snapshot: ConversationSnapshot) => (
            <option key={snapshot.id} value={snapshot.id}>
              {new Date(snapshot.createdAt).toLocaleString()}
            </option>
          ))}
        </select>
      </div>
      {data.errorMessage && <p className="error small">{data.errorMessage}</p>}
    </div>
  );
}

function SeedreamNode(props: NodeProps<Node<WorkflowNodeData>>) {
  const data = props.data as WorkflowNodeData & Record<string, any>;
  return (
    <GeneratorShell data={data} selected={props.selected} icon={<Sparkles size={16} />}>
      <PromptEditor
        nodeId={props.id}
        data={data}
        placeholder="描述要生成的图片，可通过连线或 @ 引用素材"
      />
      <div className="node-controls nodrag">
        <select
          value={data.ratio || "智能"}
          onChange={(event) => data.onDataChange?.(props.id, { ratio: event.target.value })}
        >
          {ratios.map((ratio) => (
            <option key={ratio}>{ratio}</option>
          ))}
        </select>
        <select
          value={data.size || "2K"}
          onChange={(event) => data.onDataChange?.(props.id, { size: event.target.value })}
        >
          <option>2K</option>
          <option>3K</option>
        </select>
        <select
          value={data.count || 1}
          onChange={(event) => data.onDataChange?.(props.id, { count: Number(event.target.value) })}
        >
          <option value={1}>1张</option>
          <option value={2}>2张</option>
          <option value={4}>4张</option>
        </select>
      </div>
      <div className="node-actions nodrag">
        <button type="button" onClick={() => data.onRunSeedream?.(props.id)}>
          {data.status === "running" ? <Loader2 className="spin" size={15} /> : <ImageIcon size={15} />}
          生成图片
        </button>
      </div>
    </GeneratorShell>
  );
}

function SeedanceNode(props: NodeProps<Node<WorkflowNodeData>>) {
  const data = props.data as WorkflowNodeData & Record<string, any>;
  return (
    <GeneratorShell data={data} selected={props.selected} icon={<Video size={16} />}>
      <PromptEditor
        nodeId={props.id}
        data={data}
        placeholder="描述要生成的视频，连线素材会自动变成 @ 引用"
      />
      <div className="node-controls nodrag">
        <select
          value={data.mode || "reference"}
          onChange={(event) => data.onDataChange?.(props.id, { mode: event.target.value })}
        >
          <option value="reference">参考生成</option>
          <option value="frames">首尾帧</option>
          <option value="reference_video">参考视频</option>
        </select>
        <select
          value={data.ratio || "智能"}
          onChange={(event) => data.onDataChange?.(props.id, { ratio: event.target.value })}
        >
          {ratios.map((ratio) => (
            <option key={ratio}>{ratio}</option>
          ))}
        </select>
        <select
          value={data.resolution || "720p"}
          onChange={(event) => data.onDataChange?.(props.id, { resolution: event.target.value })}
        >
          <option>480p</option>
          <option>720p</option>
          <option>1080p</option>
        </select>
        <select
          value={data.duration || 5}
          onChange={(event) => data.onDataChange?.(props.id, { duration: Number(event.target.value) })}
        >
          {[4, 5, 6, 8, 10, 15].map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds}秒
            </option>
          ))}
        </select>
        <select
          value={data.count || 1}
          onChange={(event) => data.onDataChange?.(props.id, { count: Number(event.target.value) })}
        >
          <option value={1}>1条</option>
          <option value={2}>2条</option>
          <option value={4}>4条</option>
        </select>
      </div>
      <div className="node-actions nodrag">
        <button type="button" onClick={() => data.onRunSeedance?.(props.id)}>
          {data.status === "running" ? <Loader2 className="spin" size={15} /> : <ArrowUp size={15} />}
          生成视频
        </button>
      </div>
    </GeneratorShell>
  );
}

function BailianVideoNode(props: NodeProps<Node<WorkflowNodeData>>) {
  const data = props.data as WorkflowNodeData & Record<string, any>;
  return (
    <GeneratorShell data={data} selected={props.selected} icon={<Video size={16} />}>
      <PromptEditor
        nodeId={props.id}
        data={data}
        placeholder="描述百炼视频，可 @ 引用图片、人物或参考视频"
      />
      <div className="node-controls nodrag">
        <select
          value={data.mode || "text-to-video"}
          onChange={(event) => data.onDataChange?.(props.id, { mode: event.target.value })}
        >
          <option value="text-to-video">文生视频</option>
          <option value="image-to-video">图生视频</option>
          <option value="reference-to-video">参考图</option>
          <option value="first-last-frame">首尾帧</option>
          <option value="video-edit">参考视频</option>
        </select>
        <select
          value={data.ratio || "16:9"}
          onChange={(event) => data.onDataChange?.(props.id, { ratio: event.target.value })}
        >
          {ratios.map((ratio) => (
            <option key={ratio}>{ratio}</option>
          ))}
        </select>
        <select
          value={data.resolution || "720p"}
          onChange={(event) => data.onDataChange?.(props.id, { resolution: event.target.value })}
        >
          <option>720p</option>
          <option>1080p</option>
        </select>
        <select
          value={data.duration || 5}
          onChange={(event) => data.onDataChange?.(props.id, { duration: Number(event.target.value) })}
        >
          {[2, 3, 4, 5, 6, 8, 10, 15].map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds}秒
            </option>
          ))}
        </select>
      </div>
      <div className="node-controls single nodrag">
        <select
          value={data.count || 1}
          onChange={(event) => data.onDataChange?.(props.id, { count: Number(event.target.value) })}
        >
          <option value={1}>1条</option>
          <option value={2}>2条</option>
          <option value={4}>4条</option>
        </select>
      </div>
      <div className="node-actions nodrag">
        <button type="button" onClick={() => data.onRunBailian?.(props.id)}>
          {data.status === "running" ? <Loader2 className="spin" size={15} /> : <ArrowUp size={15} />}
          生成百炼视频
        </button>
      </div>
    </GeneratorShell>
  );
}

function toPromptWithMentions(prompt: string, assets: Asset[]) {
  let next = prompt.trim();
  for (const asset of assets) {
    const mention = `@${asset.name}`;
    if (!next.includes(mention)) next = next ? `${next} ${mention}` : mention;
  }
  return next;
}

function formatProjectDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function ProjectThumbnail({ project }: { project: ProjectSummary }) {
  if (!project.thumbnailUrl) {
    return (
      <div className="project-thumb empty">
        <ImageIcon size={28} />
      </div>
    );
  }

  if (project.thumbnailKind === "video") {
    return (
      <video
        className="project-thumb"
        src={project.thumbnailUrl}
        muted
        playsInline
        preload="metadata"
      />
    );
  }

  return <img className="project-thumb" src={project.thumbnailUrl} alt={project.name} />;
}

function ProjectCard({
  project,
  onOpen,
  onDelete
}: {
  project: ProjectSummary;
  onOpen: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}) {
  return (
    <article className="project-card">
      <button className="project-card-open" type="button" onClick={() => onOpen(project.id)}>
        <ProjectThumbnail project={project} />
        <span className="project-card-body">
          <strong>{project.name}</strong>
          <span>
            更新 {formatProjectDate(project.updatedAt)} · 素材 {project.assetCount || 0} · 生成{" "}
            {project.generationCount || 0}
          </span>
          <small>创建 {formatProjectDate(project.createdAt)}</small>
        </span>
      </button>
      <button
        className="project-card-delete"
        type="button"
        aria-label={`删除项目${project.name}`}
        onClick={() => onDelete(project.id)}
      >
        <Trash2 size={16} />
      </button>
    </article>
  );
}

export default function Home() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  );
}

function WorkflowCanvas() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState("");
  const [projectView, setProjectView] = useState<"home" | "projects" | "workspace">(
    "home"
  );
  const [projectPage, setProjectPage] = useState(1);
  const [projectTotalPages, setProjectTotalPages] = useState(1);
  const [projectTotal, setProjectTotal] = useState(0);
  const [projectName, setProjectName] = useState("未命名项目");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [generationJobs, setGenerationJobs] = useState<GenerationJob[]>([]);
  const [nodes, setNodes] = useState<Node<WorkflowNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [previewItem, setPreviewItem] = useState<PreviewItem | null>(null);
  const [renamingAssetId, setRenamingAssetId] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [conversationSnapshots, setConversationSnapshots] = useState<
    Record<string, ConversationSnapshot[]>
  >({});
  const [collapsedSections, setCollapsedSections] = useState({
    people: false,
    assets: false,
    videos: false
  });
  const saveTimer = useRef<number | null>(null);
  const nodesRef = useRef<Node<WorkflowNodeData>[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const projectIdRef = useRef("");
  const assetMapRef = useRef<Map<string, Asset>>(new Map());
  const pollingBatchIds = useRef<Set<string>>(new Set());

  const assetMap = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets]
  );

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
    projectIdRef.current = projectId;
    assetMapRef.current = assetMap;
  }, [nodes, edges, projectId, assetMap]);

  const filteredAssets = assets.filter((asset) =>
    asset.name.toLowerCase().includes(search.toLowerCase())
  );
  const personAssets = filteredAssets.filter((asset) => asset.libraryType === "person");
  const libraryAssets = filteredAssets.filter((asset) => asset.libraryType !== "person");
  const videoHistory = generationJobs.filter(
    (job) => job.type === "seedance-video" || job.type === "bailian-video"
  );
  const activeVideoBatches = useMemo(
    () =>
      nodes
        .filter(
          (node) =>
            (node.type === "seedance-video" || node.type === "bailian-video") &&
            node.data.batchId &&
            ["queued", "running"].includes(
              String(node.data.status || "queued").toLowerCase()
            )
        )
        .map((node) => `${node.id}::${node.data.batchId}::${node.type}`)
        .sort()
        .join("|"),
    [nodes]
  );

  const hydrateNodes = useCallback(
    (baseNodes: Node<WorkflowNodeData>[]) =>
      baseNodes.map((node) => {
        const inputAssets = (node.data.inputAssetIds || [])
          .map((id) => assetMap.get(id))
          .filter(Boolean);
        return {
          ...node,
          data: {
            ...node.data,
            asset:
              (node.data.assetId ? assetMap.get(node.data.assetId) : undefined) ||
              node.data.asset,
            inputAssets,
            mentionAssets: assets,
            conversationSnapshots: conversationSnapshots[node.id] || [],
            onPromptChange: updateNodePrompt,
            onDataChange: updateNodeData,
            onMentionAsset: mentionAsset,
            onRemoveInputAsset: (assetId: string) =>
              removeInputAsset(node.id, assetId),
            onRunSeedream: runSeedream,
            onRunSeedance: runSeedance,
            onRunBailian: runBailian,
            onCollect: collectGeneratedAsset,
            onDeleteNode: deleteCanvasNode,
            onSaveConversation: saveConversationSnapshot,
            onLoadConversations: loadConversationSnapshots,
            onRestoreConversation: restoreConversationSnapshot,
            onPreview: setPreviewItem,
            nodeId: node.id
          }
        };
      }),
    [assetMap, assets, conversationSnapshots]
  );

  async function loadProjectList(page = projectPage) {
    const response = await fetch(`/api/projects?page=${page}&pageSize=10`);
    const data = await response.json();
    setProjects(data.projects || []);
    setProjectPage(data.page || page);
    setProjectTotalPages(data.totalPages || 1);
    setProjectTotal(data.total || 0);
  }

  useEffect(() => {
    loadProjectList(1);
  }, []);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then((response) => response.json())
      .then((data) => {
        setProjectName(data.project.name);
        setNodes(data.project.nodes || []);
        setEdges(data.project.edges || []);
        setGenerationJobs(data.project.jobs || []);
      });
    refreshAssets(projectId);
  }, [projectId]);

  useEffect(() => {
    setNodes((current) => hydrateNodes(current));
  }, [assetMap, hydrateNodes]);

  useEffect(() => {
    if (!projectId || nodes.length === 0) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveProject();
    }, 900);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [projectId, projectName, nodes, edges]);

  useEffect(() => {
    if (!activeVideoBatches) return;
    const pairs = activeVideoBatches.split("|").map((pair) => {
      const [nodeId, batchId, nodeType] = pair.split("::");
      return { nodeId, batchId, nodeType };
    });

    const pollActiveBatches = () => {
      for (const pair of pairs) {
        const node = nodesRef.current.find((item) => item.id === pair.nodeId);
        const status = String(node?.data.status || "").toLowerCase();
        if (
          node?.data.batchId === pair.batchId &&
          ["queued", "running"].includes(status)
        ) {
          pollVideoBatch(pair.nodeId, pair.batchId, pair.nodeType);
        }
      }
    };

    pollActiveBatches();
    const timer = window.setInterval(pollActiveBatches, 5000);
    return () => window.clearInterval(timer);
  }, [activeVideoBatches]);

  function updateNodeData(id: string, patch: Partial<WorkflowNodeData>) {
    setNodes((current) =>
      current.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...patch } } : node
      )
    );
  }

  function updateNodePrompt(id: string, prompt: string) {
    updateNodeData(id, { prompt });
  }

  function mentionAsset(nodeId: string, assetId: string, prompt: string) {
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== nodeId) return node;
        const inputAssetIds = [...new Set([...(node.data.inputAssetIds || []), assetId])];
        return { ...node, data: { ...node.data, prompt, inputAssetIds } };
      })
    );
  }

  function paramsForNode(node: Node<WorkflowNodeData>) {
    const {
      mode,
      ratio,
      resolution,
      duration,
      count,
      generateAudio,
      size,
      optimizePrompt,
      watermark
    } = node.data;
    return {
      mode,
      ratio,
      resolution,
      duration,
      count,
      generateAudio,
      size,
      optimizePrompt,
      watermark
    };
  }

  async function loadConversationSnapshots(nodeId: string) {
    if (!projectIdRef.current) return;
    const response = await fetch(
      `/api/conversation-snapshots?projectId=${encodeURIComponent(projectIdRef.current)}&nodeId=${encodeURIComponent(nodeId)}`
    );
    const data = await response.json();
    if (response.ok) {
      setConversationSnapshots((current) => ({
        ...current,
        [nodeId]: data.snapshots || []
      }));
    }
  }

  async function saveConversationSnapshot(nodeId: string) {
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node || !projectIdRef.current) return;
    const response = await fetch("/api/conversation-snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: projectIdRef.current,
        nodeId,
        nodeType: node.type,
        prompt: node.data.prompt || "",
        inputAssetIds: node.data.inputAssetIds || [],
        params: paramsForNode(node)
      })
    });
    if (response.ok) await loadConversationSnapshots(nodeId);
  }

  function restoreConversationSnapshot(nodeId: string, snapshotId: string) {
    const snapshot = (conversationSnapshots[nodeId] || []).find(
      (item) => item.id === snapshotId
    );
    if (!snapshot) return;
    const inputAssetIds = JSON.parse(snapshot.inputAssetIds || "[]");
    const params = JSON.parse(snapshot.paramsJson || "{}");
    updateNodeData(nodeId, {
      ...params,
      prompt: snapshot.prompt,
      inputAssetIds
    });
  }

  async function refreshAssets(nextProjectId = projectIdRef.current) {
    const query = nextProjectId ? `?projectId=${encodeURIComponent(nextProjectId)}` : "";
    const response = await fetch(`/api/assets${query}`);
    const data = await response.json();
    setAssets(data.assets || []);
  }

  function toggleSection(section: "people" | "assets" | "videos") {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section]
    }));
  }

  function removeInputAsset(nodeId: string, assetId: string) {
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== nodeId) return node;
        const nextIds = (node.data.inputAssetIds || []).filter((id) => id !== assetId);
        return { ...node, data: { ...node.data, inputAssetIds: nextIds } };
      })
    );
  }

  function deleteCanvasNode(nodeId: string) {
    const removedNode = nodesRef.current.find((node) => node.id === nodeId);
    const removedAssetId = removedNode?.data.assetId;

    setNodes((current) =>
      current
        .filter((node) => node.id !== nodeId)
        .map((node) => {
          if (!removedAssetId || !node.data.inputAssetIds?.includes(removedAssetId)) {
            return node;
          }
          return {
            ...node,
            data: {
              ...node.data,
              inputAssetIds: node.data.inputAssetIds.filter(
                (assetId) => assetId !== removedAssetId
              )
            }
          };
        })
    );
    setEdges((current) =>
      current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
    );
  }

  async function deleteLibraryAsset(assetId: string) {
    setError("");
    const response = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || "删除素材失败");
      return;
    }

    setAssets((current) => current.filter((asset) => asset.id !== assetId));
    const removedNodeIds = new Set(
      nodesRef.current
        .filter((node) => node.data.assetId === assetId)
        .map((node) => node.id)
    );
    setNodes((current) =>
      current
        .filter((node) => node.data.assetId !== assetId)
        .map((node) => ({
          ...node,
          data: {
            ...node.data,
            inputAssetIds: (node.data.inputAssetIds || []).filter(
              (inputAssetId) => inputAssetId !== assetId
            )
          }
        }))
    );
    setEdges((current) =>
      current.filter(
        (edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)
      )
    );
  }

  function startRenameAsset(asset: Asset) {
    setRenamingAssetId(asset.id);
    setRenameDraft(asset.name);
  }

  async function renameLibraryAsset(assetId: string) {
    const nextName = renameDraft.trim();
    if (!nextName) {
      setError("素材名称不能为空");
      return;
    }

    setError("");
    const response = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName })
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error || "重命名失败");
      return;
    }

    const renamedAsset = data.asset as Asset;
    setAssets((current) =>
      current.map((asset) => (asset.id === assetId ? renamedAsset : asset))
    );
    setNodes((current) =>
      current.map((node) => {
        if (node.data.assetId !== assetId) return node;
        return {
          ...node,
          data: {
            ...node.data,
            title: renamedAsset.name,
            asset: renamedAsset
          }
        };
      })
    );
    setRenamingAssetId("");
    setRenameDraft("");
  }

  function sourceAssetIdsForNode(nodeId: string) {
    const ids = new Set<string>();
    const byNodeId = new Map(nodesRef.current.map((node) => [node.id, node]));
    for (const edge of edgesRef.current) {
      if (edge.target !== nodeId) continue;
      const source = byNodeId.get(edge.source);
      const assetId = source?.data.assetId;
      if (assetId) ids.add(assetId);
    }
    const directIds =
      nodesRef.current.find((node) => node.id === nodeId)?.data.inputAssetIds || [];
    for (const id of directIds) ids.add(id);
    return [...ids];
  }

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((current) => hydrateNodes(applyNodeChanges(changes, current))),
    [hydrateNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((current) => applyEdgeChanges(changes, current)),
    []
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) =>
        addEdge({ ...connection, animated: true, type: "smoothstep" }, current)
      );
      if (!connection.source || !connection.target) return;
      const source = nodesRef.current.find((node) => node.id === connection.source);
      const assetId = source?.data.assetId;
      const asset = assetId ? assetMapRef.current.get(assetId) : undefined;
      if (!assetId || !asset) return;
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== connection.target) return node;
          const inputAssetIds = [...new Set([...(node.data.inputAssetIds || []), assetId])];
          return {
            ...node,
            data: {
              ...node.data,
              inputAssetIds,
              prompt: toPromptWithMentions(node.data.prompt || "", [asset])
            }
          };
        })
      );
    },
    []
  );

  async function saveProject() {
    if (!projectId) return;
    setSaving(true);
    const serializableNodes = nodes.map((node) => ({
      id: node.id,
      type: node.type || "asset",
      position: node.position,
      width: node.width,
      height: node.height,
      data: {
        ...node.data,
        asset: undefined,
        inputAssets: undefined,
        mentionAssets: undefined,
        conversationSnapshots: undefined,
        onPromptChange: undefined,
        onDataChange: undefined,
        onMentionAsset: undefined,
        onRemoveInputAsset: undefined,
        onRunSeedream: undefined,
        onRunSeedance: undefined,
        onRunBailian: undefined,
        onCollect: undefined,
        onDeleteNode: undefined,
        onSaveConversation: undefined,
        onLoadConversations: undefined,
        onRestoreConversation: undefined,
        onPreview: undefined,
        nodeId: undefined
      }
    }));
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: projectName, nodes: serializableNodes, edges })
    });
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? { ...project, name: projectName, updatedAt: new Date().toISOString() }
          : project
      )
    );
    setSaving(false);
  }

  function openProject(nextProjectId: string) {
    setProjectId(nextProjectId);
    setProjectView("workspace");
  }

  async function createProject() {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `项目 ${projects.length + 1}` })
    });
    const data = await response.json();
    setProjects((current) => [data.project, ...current]);
    setProjectId(data.project.id);
    setProjectName(data.project.name);
    setProjectView("workspace");
  }

  async function deleteProject(nextProjectId: string) {
    const project = projects.find((item) => item.id === nextProjectId);
    if (!window.confirm(`确定删除项目「${project?.name || "未命名项目"}」吗？`)) {
      return;
    }

    const response = await fetch(`/api/projects/${nextProjectId}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || "删除项目失败");
      return;
    }

    if (nextProjectId === projectId) {
      setProjectId("");
      setNodes([]);
      setEdges([]);
      setAssets([]);
      setGenerationJobs([]);
      setProjectView("home");
    }
    await loadProjectList(projectView === "projects" ? projectPage : 1);
  }

  async function uploadFiles(files: FileList | null, libraryType: "asset" | "person") {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      const uploaded: Asset[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("libraryType", libraryType);
        if (libraryType === "asset" && projectIdRef.current) {
          formData.append("projectId", projectIdRef.current);
        }
        const response = await fetch("/api/assets", { method: "POST", body: formData });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "上传失败");
        uploaded.push(data.asset);
      }
      setAssets((current) => [...uploaded, ...current]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  function nodePlacementCenter() {
    if (flow && typeof window !== "undefined") {
      return flow.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      });
    }
    return { x: 420, y: 260 };
  }

  function positionForNewNode(
    baseNodes: Node<WorkflowNodeData>[],
    offsetIndex = 0
  ) {
    const anchor =
      baseNodes.find((node) => node.selected) ||
      [...baseNodes]
        .reverse()
        .find((node) =>
          [
            "seedream-image",
            "seedance-video",
            "bailian-video",
            "result-image",
            "result-video",
            "asset",
            "person"
          ].includes(String(node.type || ""))
        );
    return nextNodePosition(anchor?.position || null, nodePlacementCenter(), offsetIndex);
  }

  function addAssetNode(asset: Asset, position?: { x: number; y: number }) {
    const id = `${asset.libraryType}-${asset.id}-${Date.now()}`;
    setNodes((current) => {
      const nextPosition = position || positionForNewNode(current, current.length % 4);
      return hydrateNodes([
        ...current.map((node) => ({ ...node, selected: false })),
        {
          id,
          type: asset.libraryType === "person" ? "person" : "asset",
          position: nextPosition,
          selected: true,
          data: { title: asset.name, assetId: asset.id, asset }
        }
      ]);
    });
  }

  function onDragStart(event: DragEvent, asset: Asset) {
    event.dataTransfer.setData("application/seedance-asset", asset.id);
    event.dataTransfer.effectAllowed = "move";
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    const assetId = event.dataTransfer.getData("application/seedance-asset");
    const asset = assetMap.get(assetId);
    if (!asset || !flow) return;
    const position = flow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY
    });
    addAssetNode(asset, position);
  }

  function addGenerator(type: "seedream-image" | "seedance-video" | "bailian-video") {
    const id = `${type}-${Date.now()}`;
    setNodes((current) => {
      const position = positionForNewNode(current, current.length % 4);
      return hydrateNodes([
        ...current.map((node) => ({ ...node, selected: false })),
        {
          id,
          type,
          position,
          selected: true,
          data:
            type === "seedream-image"
              ? {
                  title: "Seedream 5.0 生图",
                  prompt: "",
                  ratio: "智能",
                  size: "2K",
                  count: 1,
                  inputAssetIds: []
                }
              : type === "seedance-video"
                ? {
                  title: "Seedance 2.0 视频",
                  prompt: "",
                  mode: "reference",
                  ratio: "智能",
                  resolution: "720p",
                  duration: 5,
                  count: 1,
                  generateAudio: true,
                  inputAssetIds: []
                }
                : {
                  title: "百炼视频",
                  prompt: "",
                  mode: "text-to-video",
                  ratio: "16:9",
                  resolution: "720p",
                  duration: 5,
                  count: 1,
                  generateAudio: true,
                  watermark: false,
                  inputAssetIds: []
                }
        }
      ]);
    });
  }

  function addHistoryVideoNode(job: GenerationJob) {
    const resultUrl = job.resultUrl;
    if (!resultUrl) return;
    const id = `history-video-${job.id}-${Date.now()}`;
    setNodes((current) => {
      const position = positionForNewNode(current, current.length % 4);
      return hydrateNodes([
        ...current.map((node) => ({ ...node, selected: false })),
        {
          id,
          type: "result-video",
          position,
          selected: true,
          data: {
            title: "历史视频",
            resultUrl,
            resultKind: "video" as const,
            status: job.status || "completed"
          }
        }
      ]);
    });
  }

  async function runSeedream(nodeId: string) {
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node) return;
    const sourceIds = sourceAssetIdsForNode(nodeId);
    const sourceAssets = sourceIds
      .map((id) => assetMapRef.current.get(id))
      .filter(Boolean) as Asset[];
    const prompt = toPromptWithMentions(node.data.prompt || "", sourceAssets);
    updateNodeData(nodeId, { status: "running", prompt, errorMessage: "" });
    const response = await fetch("/api/image-generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: projectIdRef.current,
        nodeId,
        prompt,
        assetIds: sourceIds,
        ratio: node.data.ratio || "智能",
        size: node.data.size || "2K",
        count: node.data.count || 1,
        optimizePrompt: node.data.optimizePrompt ?? true,
        watermark: node.data.watermark ?? false
      })
    });
    const data = await response.json();
    if (!response.ok) {
      updateNodeData(nodeId, { status: "failed", errorMessage: data.error });
      return;
    }
    updateNodeData(nodeId, { status: "completed" });
    for (const [index, url] of (data.imageUrls || []).entries()) {
      const resultId = `result-image-${Date.now()}-${index}`;
      setNodes((current) =>
        hydrateNodes([
          ...current,
          {
            id: resultId,
            type: "result-image",
            position: {
              x: (node.position?.x || 0) + 360,
              y: (node.position?.y || 0) + index * 250
            },
            data: {
              title: `图片结果 ${index + 1}`,
              resultUrl: url,
              resultKind: "image" as const,
              status: "completed"
            }
          }
        ])
      );
    }
  }

  function syncVideoBatchToNode(
    nodeId: string,
    batch: GenerationBatchPayload,
    nodeType = "seedance-video"
  ) {
    const tasks = batch.tasks || [];
    const status = batch.status || "running";
    const videoUrl = tasks.find((task) => task.videoUrl)?.videoUrl;
    const taskError = tasks.find((task) => task.errorMessage)?.errorMessage;

    setNodes((current) => {
      const source = current.find((node) => node.id === nodeId);
      if (!source) return current;

      const resultNodeId = source.data.resultNodeId || `result-video-${nodeId}`;
      let hasResultNode = false;
      const nextNodes: Node<WorkflowNodeData>[] = current.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              batchId: batch.id,
              tasks,
              status,
              statusMessage: generationStatusMessage(status, tasks),
              errorMessage:
                taskError || (status === "failed" ? "视频生成失败" : ""),
              resultNodeId: videoUrl ? resultNodeId : node.data.resultNodeId
            }
          };
        }

        if (videoUrl && node.id === resultNodeId) {
          hasResultNode = true;
          return {
            ...node,
            data: {
              ...node.data,
              title: "视频结果",
              resultUrl: videoUrl,
              resultKind: "video" as const,
              status: "completed",
              errorMessage: ""
            }
          };
        }

        return node;
      });

      if (videoUrl && !hasResultNode) {
        nextNodes.push({
          id: resultNodeId,
          type: "result-video",
          position: {
            x: (source.position?.x || 0) + 380,
            y: source.position?.y || 0
          },
          data: {
            title: "视频结果",
            resultUrl: videoUrl,
            resultKind: "video" as const,
            status: "completed"
          }
        });
      }

      return hydrateNodes(nextNodes);
    });

    if (videoUrl) {
      const source = nodesRef.current.find((node) => node.id === nodeId);
      setGenerationJobs((current) => {
        const nextJob: GenerationJob = {
          id: batch.id,
          nodeId,
          type: nodeType,
          prompt: source?.data.prompt || "",
          status,
          resultUrl: videoUrl,
          errorMessage: taskError || null,
          createdAt: new Date().toISOString()
        };
        return [nextJob, ...current.filter((job) => job.id !== batch.id)];
      });
    }
  }

  async function pollVideoBatch(nodeId: string, batchId: string, nodeType = "seedance-video") {
    if (pollingBatchIds.current.has(batchId)) return;
    pollingBatchIds.current.add(batchId);

    try {
      const basePath =
        nodeType === "bailian-video"
          ? "/api/bailian-video-generations"
          : "/api/generations";
      const response = await fetch(`${basePath}/${batchId}`, {
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "查询视频生成状态失败");
      syncVideoBatchToNode(nodeId, data.batch, nodeType);
    } catch (pollError) {
      updateNodeData(nodeId, {
        statusMessage:
          pollError instanceof Error ? pollError.message : "查询视频生成状态失败"
      });
    } finally {
      pollingBatchIds.current.delete(batchId);
    }
  }

  async function runSeedance(nodeId: string) {
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node) return;
    const sourceIds = sourceAssetIdsForNode(nodeId);
    const sourceAssets = sourceIds
      .map((id) => assetMapRef.current.get(id))
      .filter(Boolean) as Asset[];
    const prompt = toPromptWithMentions(node.data.prompt || "", sourceAssets);
    updateNodeData(nodeId, {
      status: "queued",
      prompt,
      errorMessage: "",
      statusMessage: "已提交，等待上游排队",
      tasks: []
    });
    const response = await fetch("/api/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: projectIdRef.current,
        nodeId,
        prompt,
        mode: node.data.mode || "reference",
        ratio: node.data.ratio || "智能",
        resolution: node.data.resolution || "720p",
        duration: node.data.duration || 5,
        count: node.data.count || 1,
        generateAudio: node.data.generateAudio ?? true,
        assetIds: sourceIds
      })
    });
    const data = await response.json();
    if (!response.ok) {
      updateNodeData(nodeId, { status: "failed", errorMessage: data.error });
      return;
    }
    syncVideoBatchToNode(nodeId, data.batch, "seedance-video");
  }

  async function runBailian(nodeId: string) {
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node) return;
    const sourceIds = sourceAssetIdsForNode(nodeId);
    const sourceAssets = sourceIds
      .map((id) => assetMapRef.current.get(id))
      .filter(Boolean) as Asset[];
    const prompt = toPromptWithMentions(node.data.prompt || "", sourceAssets);
    updateNodeData(nodeId, {
      status: "queued",
      prompt,
      errorMessage: "",
      statusMessage: "已提交，等待百炼排队",
      tasks: []
    });
    const response = await fetch("/api/bailian-video-generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: projectIdRef.current,
        nodeId,
        prompt,
        mode: node.data.mode || "text-to-video",
        ratio: node.data.ratio || "16:9",
        resolution: node.data.resolution || "720p",
        duration: node.data.duration || 5,
        count: node.data.count || 1,
        generateAudio: node.data.generateAudio ?? true,
        watermark: node.data.watermark ?? false,
        assetIds: sourceIds
      })
    });
    const data = await response.json();
    if (!response.ok) {
      updateNodeData(nodeId, { status: "failed", errorMessage: data.error });
      return;
    }
    syncVideoBatchToNode(nodeId, data.batch, "bailian-video");
  }

  async function collectGeneratedAsset(data: WorkflowNodeData) {
    if (!data.resultUrl) return;
    const response = await fetch("/api/assets/from-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: data.resultUrl,
        name: data.title || "生成素材",
        kind:
          data.resultKind === "video" || data.resultUrl.includes(".mp4")
            ? "video"
            : "image",
        libraryType: "asset",
        projectId: projectIdRef.current
      })
    });
    const payload = await response.json();
    if (response.ok) setAssets((current) => [payload.asset, ...current]);
  }

  if (projectView === "home") {
    return (
      <main className="project-home">
        <section className="project-hero">
          <div>
            <p>Seedance / Seedream 工作流</p>
            <h1>项目中心</h1>
            <span>管理画布项目、素材和生成历史。最近 10 个项目会显示在这里。</span>
          </div>
          <button type="button" onClick={createProject}>
            <Plus size={18} />
            新建项目
          </button>
        </section>

        <section className="project-panel">
          <div className="project-panel-head">
            <div>
              <h2>最近项目</h2>
              <span>共 {projectTotal} 个项目</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setProjectView("projects");
                loadProjectList(1);
              }}
            >
              更多项目
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="project-grid">
            {projects.slice(0, 10).map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={openProject}
                onDelete={deleteProject}
              />
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (projectView === "projects") {
    return (
      <main className="project-home">
        <section className="project-hero compact">
          <div>
            <p>全部项目</p>
            <h1>项目分页</h1>
            <span>按更新时间排序，每页 10 个项目。</span>
          </div>
          <div className="project-hero-actions">
            <button type="button" onClick={() => setProjectView("home")}>
              返回首页
            </button>
            <button type="button" onClick={createProject}>
              <Plus size={18} />
              新建项目
            </button>
          </div>
        </section>

        <section className="project-panel">
          <div className="project-grid">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={openProject}
                onDelete={deleteProject}
              />
            ))}
          </div>
          <div className="project-pagination">
            <button
              type="button"
              disabled={projectPage <= 1}
              onClick={() => loadProjectList(projectPage - 1)}
            >
              上一页
            </button>
            <span>
              第 {projectPage} / {projectTotalPages} 页
            </span>
            <button
              type="button"
              disabled={projectPage >= projectTotalPages}
              onClick={() => loadProjectList(projectPage + 1)}
            >
              下一页
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="workflow-page">
      <aside className="library-sidebar">
        <div className="project-bar">
          <select value={projectId} onChange={(event) => openProject(event.target.value)}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={createProject}>
            <Plus size={16} />
          </button>
          <button type="button" onClick={() => setProjectView("home")} aria-label="返回项目首页">
            <ChevronLeft size={16} />
          </button>
        </div>
        <input
          className="project-name"
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
        />
        <div className="save-state">
          <Save size={14} />
          {saving ? "保存中" : "已本地保存"}
        </div>

        <div className="library-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索资源"
          />
        </div>

        <section>
          <div className="library-head">
            <button
              className="library-toggle"
              type="button"
              onClick={() => toggleSection("people")}
            >
              {collapsedSections.people ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
              人物角色库
            </button>
            <label>
              <Plus size={15} />
              <input
                type="file"
                accept="image/*"
                hidden
                multiple
                onChange={(event) => uploadFiles(event.target.files, "person")}
              />
            </label>
          </div>
          {!collapsedSections.people && (
            <div className="library-list scroll-list">
              {personAssets.map((asset) => (
                <div
                  draggable={renamingAssetId !== asset.id}
                  onDragStart={(event) => onDragStart(event, asset)}
                  className="library-card"
                  key={asset.id}
                >
                  <div
                    className="library-card-main"
                    onClick={() => addAssetNode(asset)}
                  >
                    <ResourcePreview
                      asset={asset}
                      onOpen={() => setPreviewItem(assetPreviewItem(asset))}
                    />
                    {renamingAssetId === asset.id ? (
                      <input
                        className="library-rename-input"
                        value={renameDraft}
                        autoFocus
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") renameLibraryAsset(asset.id);
                          if (event.key === "Escape") setRenamingAssetId("");
                        }}
                      />
                    ) : (
                      <span>{asset.name}</span>
                    )}
                    <UserRound size={14} />
                  </div>
                  {renamingAssetId === asset.id ? (
                    <>
                      <button
                        className="library-delete confirm"
                        type="button"
                        aria-label={`保存${asset.name}`}
                        onClick={() => renameLibraryAsset(asset.id)}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        className="library-delete"
                        type="button"
                        aria-label="取消改名"
                        onClick={() => setRenamingAssetId("")}
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="library-delete"
                        type="button"
                        aria-label={`放大查看${asset.name}`}
                        onClick={() => setPreviewItem(assetPreviewItem(asset))}
                      >
                        <Maximize2 size={14} />
                      </button>
                      <button
                        className="library-delete"
                        type="button"
                        aria-label={`重命名${asset.name}`}
                        onClick={() => startRenameAsset(asset)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="library-delete"
                        type="button"
                        aria-label={`删除${asset.name}`}
                        onClick={() => deleteLibraryAsset(asset.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="library-head">
            <button
              className="library-toggle"
              type="button"
              onClick={() => toggleSection("assets")}
            >
              {collapsedSections.assets ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
              素材库
            </button>
            <label>
              <Plus size={15} />
              <input
                type="file"
                accept="image/*,video/*,audio/*"
                hidden
                multiple
                onChange={(event) => uploadFiles(event.target.files, "asset")}
              />
            </label>
          </div>
          {!collapsedSections.assets && (
            <div className="library-list scroll-list">
              {libraryAssets.map((asset) => (
                <div
                  draggable={renamingAssetId !== asset.id}
                  onDragStart={(event) => onDragStart(event, asset)}
                  className="library-card"
                  key={asset.id}
                >
                  <div
                    className="library-card-main"
                    onClick={() => addAssetNode(asset)}
                  >
                    <ResourcePreview
                      asset={asset}
                      onOpen={() => setPreviewItem(assetPreviewItem(asset))}
                    />
                    {renamingAssetId === asset.id ? (
                      <input
                        className="library-rename-input"
                        value={renameDraft}
                        autoFocus
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") renameLibraryAsset(asset.id);
                          if (event.key === "Escape") setRenamingAssetId("");
                        }}
                      />
                    ) : (
                      <span>{asset.name}</span>
                    )}
                    {asset.kind === "video" ? <Video size={14} /> : <ImageIcon size={14} />}
                  </div>
                  {renamingAssetId === asset.id ? (
                    <>
                      <button
                        className="library-delete confirm"
                        type="button"
                        aria-label={`保存${asset.name}`}
                        onClick={() => renameLibraryAsset(asset.id)}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        className="library-delete"
                        type="button"
                        aria-label="取消改名"
                        onClick={() => setRenamingAssetId("")}
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="library-delete"
                        type="button"
                        aria-label={`放大查看${asset.name}`}
                        onClick={() => setPreviewItem(assetPreviewItem(asset))}
                      >
                        <Maximize2 size={14} />
                      </button>
                      <button
                        className="library-delete"
                        type="button"
                        aria-label={`重命名${asset.name}`}
                        onClick={() => startRenameAsset(asset)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="library-delete"
                        type="button"
                        aria-label={`删除${asset.name}`}
                        onClick={() => deleteLibraryAsset(asset.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="library-head">
            <button
              className="library-toggle"
              type="button"
              onClick={() => toggleSection("videos")}
            >
              {collapsedSections.videos ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
              历史视频
            </button>
          </div>
          {!collapsedSections.videos && (
            <div className="library-list scroll-list">
              {videoHistory.length === 0 && <p className="small">暂无生成视频</p>}
              {videoHistory.map((job) => (
                <div className="library-card" key={job.id}>
                  <button
                    className="library-card-main"
                    type="button"
                    onClick={() => addHistoryVideoNode(job)}
                    disabled={!job.resultUrl}
                  >
                    <div className="thumb empty-thumb">
                      <Video size={18} />
                    </div>
                    <span>{job.prompt || "Seedance 视频"}</span>
                    <span className={`mini-status ${job.status}`}>{generationStatusLabel(job.status)}</span>
                  </button>
                  <button
                    className="library-delete"
                    type="button"
                    disabled={!job.resultUrl}
                    aria-label="放大查看历史视频"
                    onClick={() =>
                      job.resultUrl &&
                      setPreviewItem({
                        title: job.prompt || "历史视频",
                        url: job.resultUrl,
                        kind: "video"
                      })
                    }
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {uploading && <p className="small">素材上传中...</p>}
        {error && <p className="error small">{error}</p>}
      </aside>

      <section className="canvas-shell">
        <div className="canvas-toolbar">
          <button type="button" onClick={() => addGenerator("seedream-image")}>
            <Sparkles size={16} />
            Seedream 生图节点
          </button>
          <button type="button" onClick={() => addGenerator("seedance-video")}>
            <Video size={16} />
            Seedance 视频节点
          </button>
          <button type="button" onClick={() => addGenerator("bailian-video")}>
            <Video size={16} />
            百炼视频节点
          </button>
          <span>拖资源到画布，连到生成节点输入端即可形成 @ 引用。</span>
        </div>
        <div className="flow-wrap" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
          <ReactFlow
            nodes={hydrateNodes(nodes)}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setFlow}
            fitView
          >
            <Background />
            <MiniMap />
            <Controls />
          </ReactFlow>
        </div>
      </section>
      <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
    </main>
  );
}
