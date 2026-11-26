import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreatePropertyFeatureDto } from './dto/create-property-feature.dto';
import { UpdatePropertyFeatureDto } from './dto/update-property-feature.dto';

@Injectable()
export class PropertyFeaturesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePropertyFeatureDto) {
    const existing = await this.prisma.propertyFeature.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException('Feature with this name already exists');
    return this.prisma.propertyFeature.create({ data: dto as never });
  }

  async findAll() {
    return this.prisma.propertyFeature.findMany({
      include: { _count: { select: { mapping: true } } },
    });
  }

  async findOne(id: number) {
    const f = await this.prisma.propertyFeature.findUnique({
      where: { id },
      include: { mapping: { include: { property: true } } },
    });
    if (!f) throw new NotFoundException('Property feature not found');
    return f;
  }

  async update(id: number, dto: UpdatePropertyFeatureDto) {
    await this.findOne(id);
    return this.prisma.propertyFeature.update({
      where: { id },
      data: dto as never,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.propertyFeature.delete({ where: { id } });
  }
}
