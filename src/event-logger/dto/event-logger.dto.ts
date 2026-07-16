enum Status {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

interface ILoggerProperty {
  payload: object;
  status: Status;
}

export default class EventLoggerDto {
  module_type: string;
  module_id: number;
  issuer_type: string;
  issuer_id: number;
  properties: ILoggerProperty;
}
