// utils
// --------------------------------------------------------------------------

type RequireOnly<T, K extends keyof T> = Partial<T> & Required<Pick<T, K>>;

type Prettify<T> = {
  [k in keyof T]: T[k];
} & {};

// --------------------------------------------------------------------------

// types
// --------------------------------------------------------------------------

type SallaViteMode = "development" | "production";

type HMRClientWebSocketPorts = {
  assetsPort: number;
  hmrPort: number;
}

type HMRClientWebSocketAciton = "setup-hmr" | "css-hmr" | "js-hmr";

type HMRClientWebSocketMessage = {
  action: HMRClientWebSocketAciton;
  data: unknown;
}

type SallaCliParams = {
  theme_id: number | undefined;
  draft_id: number | undefined;
  store_id: number | undefined;
  upload_url: string | undefined;
  wsport: number | undefined;
  sallaCli: "salla" | undefined;
  lastRequestTime: number | undefined;
};

type ScriptExtensionType = "js" | "ts" | "mjs" | "mts" | "cjs";
type JsExtensionType = ".js" | ".ts" | ".mjs" | ".mts" | ".cjs";
type CssExtensionType = ".css" | ".scss" | ".sass";
type FileExtensionType = JsExtensionType | CssExtensionType | ".json" | ".twig";

type ExtensionType = "style" | "script" | "twig" | "json";

type SallaStyleEntryName = string;

type SallaScriptEntryName =
  | "app"
  | "home"
  | "product-card"
  | "main-menu"
  | "wishlist-card"
  | "checkout"
  | "pages"
  | "product"
  | "order"
  | "testimonials";

type SallaEntryName = SallaScriptEntryName | "style";

type ViteStyleRollupEntries = Record<SallaStyleEntryName, string>;
type ViteScriptRollupEntries = Record<SallaScriptEntryName, string>;
type ViteRollupEntries = Record<SallaEntryName, string>;

type ViteStyleRollupEntry = {
  [K in SallaStyleEntryName]: { [P in K]: ViteStyleRollupEntries[P] };
}[SallaStyleEntryName];

type ViteScriptRollupEntry = {
  [K in SallaScriptEntryName]: { [P in K]: ViteScriptRollupEntries[P] };
}[SallaScriptEntryName];

type ViteRollupEntry = {
  [K in SallaEntryName]: { [P in K]: ViteRollupEntries[P] };
}[SallaEntryName];

type SallaViteScriptPluginConfig = {
  rollupEntry: ViteScriptRollupEntry;
  rollupEntryName: SallaScriptEntryName;
  logDetails?: boolean;
};

type SallaViteStylePluginConfig = {
  rollupEntry: ViteStyleRollupEntry;
  rollupEntryName: SallaStyleEntryName;
  logDetails?: boolean;
};

type SallaViteProductionPluginConfig = {
  rollupEntry: ViteRollupEntry;
  rollupEntryName: SallaEntryName;
};

type DeferedScriptBuild = {
  config: SallaViteScriptPluginConfig;
  resolver: (value: unknown) => void;
};

type DeferedStyleBuild = {
  config: SallaViteStylePluginConfig;
  resolver: (value: unknown) => void;
};

type FilePath = string;

// --------------------------------------------------------------------------
