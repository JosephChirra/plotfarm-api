import { Module } from '@nestjs/common';
import { PropertyFavoritesController } from './property-favorites.controller';
import { PropertyFavoritesService } from './property-favorites.service';

@Module({
  controllers: [PropertyFavoritesController],
  providers: [PropertyFavoritesService],
})
export class PropertyFavoritesModule {}
