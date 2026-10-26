import { Body, Controller, Get, Param, Patch, Query, Post, ParseUUIDPipe, UploadedFile, UseInterceptors, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CurrentUser, TenantId } from '../security/current-user.decorator';
import { AuthTokenPayload } from '../auth/token';
import { ContactWorkspaceService, OperatorInput } from './contact-workspace.service';
import { LeadsService } from './leads.service';
import { Roles } from '../security/roles.decorator';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService, private readonly workspace: ContactWorkspaceService) {}

  @Get('roster') roster(@TenantId() companyId:string,@Query() filters:{page?:string;search?:string;stage?:string;from?:string;to?:string;assignee?:string}){return this.leads.roster(companyId,filters);}

  @Get('templates') @Roles('owner','admin') templates(@TenantId() companyId:string) { return this.workspace.templates(companyId); }
  @Get(':id/workspace') detail(@TenantId() companyId:string,@Param('id',ParseUUIDPipe) id:string){return this.workspace.detail(companyId,id);}
  @Get(':id/messages') messages(@TenantId() companyId:string,@Param('id',ParseUUIDPipe) id:string,@Query('conversation_id') conversationId?:string,@Query('cursor') cursor?:string){return this.workspace.page(companyId,id,conversationId,cursor);}
  @Patch(':id/attention') @Roles('owner','admin') attention(@TenantId() companyId:string,@Param('id',ParseUUIDPipe) id:string,@CurrentUser() user:AuthTokenPayload,@Body() body:{mode:'auto'|'human'}){return this.workspace.attention(companyId,id,user,body.mode);}
  @Patch(':id/stage') @Roles('owner','admin') stage(@TenantId() companyId:string,@Param('id',ParseUUIDPipe) id:string,@CurrentUser() user:AuthTokenPayload,@Body() body:{stage:string}){return this.workspace.stage(companyId,id,user,body.stage);}
  @Patch(':id/assignee') @Roles('owner','admin') assign(@TenantId() companyId:string,@Param('id',ParseUUIDPipe) id:string,@CurrentUser() user:AuthTokenPayload,@Body() body:{assignee_id:string}){return this.workspace.assign(companyId,id,user,body.assignee_id);}
  @Post(':id/messages') @Roles('owner','admin') send(@TenantId() companyId:string,@Param('id',ParseUUIDPipe) id:string,@CurrentUser() user:AuthTokenPayload,@Body() body:OperatorInput){return this.workspace.send(companyId,id,user,body);}
  @Post(':id/media') @Roles('owner','admin') @UseInterceptors(FileInterceptor('file',{limits:{fileSize:16*1024*1024}}))
  upload(@TenantId() companyId:string,@Param('id',ParseUUIDPipe) id:string,@CurrentUser() user:AuthTokenPayload,@UploadedFile() file:{buffer:Buffer;originalname:string;mimetype:string}){return this.workspace.upload(companyId,id,user,file);}
  @Get(':id/attachments/:messageId') async download(@TenantId() companyId:string,@Param('id',ParseUUIDPipe) id:string,@Param('messageId',ParseUUIDPipe) messageId:string,@Query('conversation_id') conversationId:string,@Res() response:Response){
    const file=await this.workspace.download(companyId,id,conversationId,messageId);
    response.setHeader('Content-Type','application/octet-stream');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);response.send(file.buffer);
  }
  @Post(':id/notes') @Roles('owner','admin') note(@TenantId() companyId:string,@Param('id',ParseUUIDPipe) id:string,@CurrentUser() user:AuthTokenPayload,@Body() body:{content:string;next_action?:string}){return this.workspace.note(companyId,id,user,body.content,body.next_action);}
  @Post(':id/followups') @Roles('owner','admin') followup(@TenantId() companyId:string,@Param('id',ParseUUIDPipe) id:string,@CurrentUser() user:AuthTokenPayload,@Body() body:{message:string;scheduled_at:string}){return this.workspace.schedule(companyId,id,user,body);}
  @Get(':id/calendars') calendars(@TenantId() companyId:string,@Param('id',ParseUUIDPipe) id:string){return this.workspace.calendars(companyId,id);}
  @Get(':id/meetings/:meetingId/link') meetingLink(@TenantId() companyId:string,@Param('id',ParseUUIDPipe) id:string,@Param('meetingId',ParseUUIDPipe) meetingId:string){return this.workspace.meetingLink(companyId,id,meetingId);}
  @Post(':id/meetings') @Roles('owner','admin') meeting(@TenantId() companyId:string,@Param('id',ParseUUIDPipe) id:string,@CurrentUser() user:AuthTokenPayload,@Body() body:{start_time:string;duration:number;calendar_id:string;email:string;request_id:string}){return this.workspace.meeting(companyId,id,user,body);}

  @Get()
  list(
    @Query('company_id') companyId = 'sabero',
    @Query('limit') limit = '50',
  ) {
    return this.leads.list(companyId, Number(limit));
  }

  @Get(':id')
  get(@Param('id') id: string, @Query('company_id') companyId = 'sabero') {
    return this.leads.get(companyId, id);
  }

  @Patch(':id/status')
  @Roles('owner', 'admin')
  updateStatus(
    @TenantId() companyId:string,
    @CurrentUser() user:AuthTokenPayload,
    @Param('id') id: string,
    @Body() body: { company_id?: string; status: string },
  ) {
    return this.workspace.stage(companyId,id,user,body.status==='new'?'nuevo':body.status);
  }
}
