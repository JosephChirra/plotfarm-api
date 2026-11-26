import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  search(
    @Query() query: SearchQueryDto,
    @CurrentUser('id') viewerId?: string,
  ) {
    const categoryId = query.landTypeId ?? query.categoryId;
    return this.searchService.search({ ...query, categoryId }, viewerId);
  }
}
