import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreatePropertyMediaDto } from './dto/create-property-media.dto';
import { UpdatePropertyMediaDto } from './dto/update-property-media.dto';

@Injectable()
export class PropertyMediaService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePropertyMediaDto) {
    return this.prisma.propertyMedia.create({
      data: dto as never,
      include: { property: true },
    });
  }

  async findAll(propertyId?: string) {
    const where = propertyId ? { propertyId } : {};
    return this.prisma.propertyMedia.findMany({
      where,
      include: { property: true },
    });
  }

  async findOne(id: string) {
    const media = await this.prisma.propertyMedia.findUnique({
      where: { id },
      include: { property: true },
    });
    if (!media) throw new NotFoundException('Property media not found');
    return media;
  }

  async update(id: string, dto: UpdatePropertyMediaDto) {
    await this.findOne(id);
    return this.prisma.propertyMedia.update({
      where: { id },
      data: dto as never,
      include: { property: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.propertyMedia.delete({ where: { id } });
  }
}
