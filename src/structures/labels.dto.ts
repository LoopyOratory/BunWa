export class Label {
  id: string;
  name: string;
  color?: string;
  colorHex?: string;
}

export class LabelDTO {
  name: string;
  color?: string;
}

export class LabelID {
  id: string;
}

export class LabelBody {
  name: string;
  colorHex?: string;
  color?: string;
}

export class SetLabelsRequest {
  labels: string[];
}

export class LabelChatAssociation {
  chatId: string;
  labelId: string;
  type?: string;
}
