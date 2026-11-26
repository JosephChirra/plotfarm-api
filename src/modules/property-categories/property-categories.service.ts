import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreatePropertyCategoryDto } from './dto/create-property-category.dto';
import { UpdatePropertyCategoryDto } from './dto/update-property-category.dto';

@Injectable()
export class PropertyCategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePropertyCategoryDto) {
    const existing = await this.prisma.propertyCategory.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException('Land type with this name already exists');
    return this.prisma.propertyCategory.create({ data: dto as never });
  }

  async findAll() {
    return this.prisma.propertyCategory.findMany({
      include: { _count: { select: { properties: true } } },
    });
  }

  async findOne(id: number) {
    const cat = await this.prisma.propertyCategory.findUnique({
      where: { id },
      include: { properties: true },
    });
    if (!cat) throw new NotFoundException('Land type not found');
    return cat;
  }

  async update(id: number, dto: UpdatePropertyCategoryDto) {
    await this.findOne(id);
    return this.prisma.propertyCategory.update({
      where: { id },
      data: dto as never,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.propertyCategory.delete({ where: { id } });
  }
}
