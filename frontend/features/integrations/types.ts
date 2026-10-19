export type PickerConfig = {
  company_id: string;
  client_id: string | null;
  developer_key: string | null;
  app_id: string | null;
  scopes: string[];
  enabled: boolean;
};

export type TokenClient = {
  requestAccessToken: (options: { prompt: string }) => void;
};

export type PickerDocument = {
  id: string;
  name: string;
  mimeType: string;
  url?: string;
};

declare global {
  interface Window {
    FB?: {
      init: (options: {
        appId: string;
        autoLogAppEvents?: boolean;
        xfbml?: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
    google?: any;
    gapi?: any;
  }
}

export type FacebookLoginResponse = {
  authResponse?: {
    code?: string;
  };
  status?: string;
};

export type WhatsAppEmbeddedSignupConfig = {
  app_id: string;
  config_id: string | null;
  graph_api_version: string;
  enabled: boolean;
  missing: string[];
};

export type WhatsAppConnection = {
  id: string;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  status: string;
};

export type WhatsAppSignupAssets = {
  waba_id?: string;
  phone_number_id?: string;
};


