export class SendListRequest {
  session?: string;
  chatId: string;
  title: string;
  description: string;
  button: string;
  sections: Section[];
}

export class Section {
  title: string;
  rows: Row[];
}

export class Row {
  title: string;
  description?: string;
  rowId?: string;
}
