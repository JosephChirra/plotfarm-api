import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { PropertyLeadsService } from './property-leads.service';
import { CreatePublicLeadDto } from './dto/create-public-lead.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * Public marketplace endpoint.
 * No JWT required for guests; if a valid Bearer token is sent, the owner cannot self-lead.
 */
@Controller('leads')
export class LeadsController {
  constructor(private service: PropertyLeadsService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  create(
    @Body() dto: CreatePublicLeadDto,
    @CurrentUser() user?: { id: string },
  ) {
    return this.service.createPublic(dto, user?.id);
  }
}

