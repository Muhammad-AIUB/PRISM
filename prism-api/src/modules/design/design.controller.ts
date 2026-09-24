import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTokenAuthGuard } from '../../auth/api-token-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { User } from '../../database/entities';
import { renderBlueprintMarkdown } from '../../design/blueprint-markdown';
import { WebAuthGuard } from '../auth/web-auth.guard';
import { DesignService } from './design.service';
import { DesignBriefDto, toBrief } from './dto/design-brief.dto';

/** Design Studio for the browser, behind the session cookie. */
@Controller('design')
@UseGuards(WebAuthGuard)
export class DesignController {
  constructor(private readonly designs: DesignService) {}

  @Get()
  async index(@CurrentUser() user: User) {
    return { designs: await this.designs.list(user) };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async create(@CurrentUser() user: User, @Body() dto: DesignBriefDto) {
    return { design: await this.designs.create(user, toBrief(dto)) };
  }

  @Get(':id')
  async show(@CurrentUser() user: User, @Param('id') id: string) {
    return { design: await this.designs.show(user, id) };
  }

  /** Written to the response for the same reason the PDF export is: headers matter. */
  @Get(':id/markdown')
  async markdown(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const { filename, body } = await this.designs.markdown(user, id);

    response
      .status(HttpStatus.OK)
      .set({
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      })
      .send(body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.designs.remove(user, id);
  }
}

/**
 * The same, for the MCP server's design_system tool. Additive routes under
 * /api/v1; nothing existing moves. The Markdown rides along on create and
 * show because it is what an agent actually wants to read.
 */
@Controller('api/v1/designs')
@UseGuards(ApiTokenAuthGuard)
export class DesignApiController {
  constructor(private readonly designs: DesignService) {}

  @Get()
  async index(@CurrentUser() user: User) {
    return { designs: await this.designs.list(user) };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async create(@CurrentUser() user: User, @Body() dto: DesignBriefDto) {
    const design = await this.designs.create(user, toBrief(dto));

    return { design, markdown: renderBlueprintMarkdown(design) };
  }

  @Get(':id')
  async show(@CurrentUser() user: User, @Param('id') id: string) {
    const design = await this.designs.show(user, id);

    return { design, markdown: renderBlueprintMarkdown(design) };
  }
}
