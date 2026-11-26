import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePlanDto) {
    const existing = await this.prisma.plan.findFirst({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException('Plan with this name already exists');
    return this.prisma.plan.create({ data: dto as never });
  }

  async findAll() {
    return this.prisma.plan.findMany({
      include: { _count: { select: { subscriptions: true } } },
    });
  }

  async findOne(id: number) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: { subscriptions: true },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async update(id: number, dto: UpdatePlanDto) {
    await this.findOne(id);
    return this.prisma.plan.update({
      where: { id },
      data: dto as never,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.plan.delete({ where: { id } });
  }
}
