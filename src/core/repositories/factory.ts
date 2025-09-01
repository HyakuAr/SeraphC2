/**
 * Repository factory for SeraphC2
 */

import {
  RepositoryFactory,
  ImplantRepository,
  OperatorRepository,
  CommandRepository,
} from './interfaces';
import { PostgresImplantRepository } from './implant.repository';
import { PostgresOperatorRepository } from './operator.repository';
import { PostgresCommandRepository } from './command.repository';

export class PostgresRepositoryFactory implements RepositoryFactory {
  private static instance: PostgresRepositoryFactory;
  private implantRepository: ImplantRepository;
  private operatorRepository: OperatorRepository;
  private commandRepository: CommandRepository;

  private constructor() {
    this.implantRepository = new PostgresImplantRepository();
    this.operatorRepository = new PostgresOperatorRepository();
    this.commandRepository = new PostgresCommandRepository();
  }

  public static getInstance(): PostgresRepositoryFactory {
    if (!PostgresRepositoryFactory.instance) {
      PostgresRepositoryFactory.instance = new PostgresRepositoryFactory();
    }
    return PostgresRepositoryFactory.instance;
  }

  public getImplantRepository(): ImplantRepository {
    return this.implantRepository;
  }

  public getOperatorRepository(): OperatorRepository {
    return this.operatorRepository;
  }

  public getCommandRepository(): CommandRepository {
    return this.commandRepository;
  }
}

// Export singleton instance
export const repositoryFactory = PostgresRepositoryFactory.getInstance();
