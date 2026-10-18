import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CalendarService, CreateMeetingInput } from './calendar.service';
import { Roles } from '../security/roles.decorator';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('availability')
  availability(
    @Query('company_id') companyId = 'sabero',
    @Query('time_min') timeMin: string,
    @Query('time_max') timeMax: string,
  ) {
    return this.calendar.getAvailability({ companyId, timeMin, timeMax });
  }

  @Get('meetings')
  listMeetings(@Query('company_id') companyId = 'sabero') {
    return this.calendar.listMeetings(companyId);
  }

  @Post('meetings')
  @Roles('owner', 'admin')
  createMeeting(@Body() body: CreateMeetingInput) {
    return this.calendar.createMeeting({
      ...body,
      company_id: body.company_id || 'sabero',
    });
  }
}
