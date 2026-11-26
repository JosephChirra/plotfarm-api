import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LeadStatus, UserRole } from '@prisma/client';
import { PropertyLeadsService } from './property-leads.service';
import { CreatePropertyLeadDto } from './dto/create-property-lead.dto';
import { UpdatePropertyLeadDto } from './dto/update-property-lead.dto';
import { FindPropertyLeadsQueryDto } from './dto/find-property-leads-query.dto';
import { AddLeadMessageDto } from './dto/add-lead-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('property-leads')
export class PropertyLeadsController {
  constructor(private service: PropertyLeadsService) { }

  @Post()
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  create(
    @Body() dto: CreatePropertyLeadDto,
    @CurrentUser('id') buyerId: string,
  ) {
    return this.service.create(dto, buyerId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll(@Query() query: FindPropertyLeadsQueryDto) {
    return this.service.findAll(
      { page: query.page, limit: query.limit },
      { propertyId: query.propertyId, buyerId: query.buyerId, status: query.status },
    );
  }

  @Get('owner/mine')
  @UseGuards(JwtAuthGuard)
  findForOwner(@CurrentUser('id') ownerId: string) {
    return this.service.findForOwner(ownerId);
  }

  @Get('buyer/mine')
  @UseGuards(JwtAuthGuard)
  findForBuyer(@CurrentUser('id') buyerId: string) {
    return this.service.findForBuyer(buyerId);
  }

  @Get(':id/messages')
  @UseGuards(JwtAuthGuard)
  getMessages(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.getMessagesForUser(id, user.id, user.role);
  }

  @Post(':id/messages')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  addMessage(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: AddLeadMessageDto,
  ) {
    return this.service.addMessage(id, userId, body.message);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.findOne(id, user.id, user.role);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePropertyLeadDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.update(id, dto, user.id, user.role);
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  markAsRead(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.markAsRead(id, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.remove(id, user.id, user.role);
  }
}
