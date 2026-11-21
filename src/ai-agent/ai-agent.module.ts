import { CatalogSearchService } from './catalog-search.service';
import { Module } from '@nestjs/common';
import { AiAgentController, AiAgentGuard } from './ai-agent.controller';
import { AiAgentService } from './ai-agent.service';
import { DetailSearchService } from './detail-search.service';
import { DataAggregatorService } from './data-aggregator.service';
import { CaslModule } from '../casl/casl.module';

@Module({ imports: [CaslModule], controllers: [AiAgentController], providers: [AiAgentService, DataAggregatorService, DetailSearchService, CatalogSearchService, AiAgentGuard] })
export class AiAgentModule {}
