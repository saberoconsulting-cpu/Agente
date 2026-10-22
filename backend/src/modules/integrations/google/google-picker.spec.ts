import {GoogleIntegrationController} from './google-integration.controller';
describe('Google Picker configuration',()=>{
  function setup(overrides:Record<string,string>={}){
    const values={GOOGLE_CLIENT_ID:'1085978981794-client.apps.googleusercontent.com',GOOGLE_APP_ID:'1085978981794',GOOGLE_PICKER_API_KEY:'browser-key',...overrides};
    return new GoogleIntegrationController({} as any,{getScopes:()=>['https://www.googleapis.com/auth/drive.file']} as any,{get:(key:string)=>values[key as keyof typeof values]} as any);
  }
  it('enables the configured project and scopes the response to the authenticated tenant',()=>{
    const config=setup().pickerConfig('company-a');expect(config.enabled).toBe(true);expect(config.company_id).toBe('company-a');expect(config.app_id).toBe('1085978981794');
  });
  it('rejects a project number left over from the previous OAuth application',()=>{expect(setup({GOOGLE_APP_ID:'829902045601'}).pickerConfig('company-a').enabled).toBe(false);});
  it('does not enable the selector when the browser key is missing',()=>{expect(setup({GOOGLE_PICKER_API_KEY:''}).pickerConfig('company-a').enabled).toBe(false);});
});
