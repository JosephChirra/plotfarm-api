import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PropertyFavoritesService } from './property-favorites.service';

@Controller('property-favorites')
@UseGuards(JwtAuthGuard)
export class PropertyFavoritesController {
  constructor(private service: PropertyFavoritesService) { }

  @Post(':userId/:propertyId')
  create(
    @Param('userId') userId: string,
    @Param('propertyId') propertyId: string,
  ) {
    return this.service.create(userId, propertyId);
  }

  @Get()
  findAll(@Query('userId') userId?: string) {
    return this.service.findAll(userId);
  }

  @Get(':userId/:propertyId')
  findOne(
    @Param('userId') userId: string,
    @Param('propertyId') propertyId: string,
  ) {
    return this.service.findOne(userId, propertyId);
  }

  @Delete(':userId/:propertyId')
  remove(
    @Param('userId') userId: string,
    @Param('propertyId') propertyId: string,
  ) {
    return this.service.remove(userId, propertyId);
  }
}
