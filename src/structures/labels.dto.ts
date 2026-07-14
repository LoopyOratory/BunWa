export class Label {
  id!: string;
  name!: string;
  color?: string | number;
  colorHex?: string;
}

export class LabelDTO {
  name!: string;
  color?: string | number;
}

export class LabelID {
  id!: string;
}

export class LabelBody {
  name!: string;
  colorHex?: string;
  color?: string;
}

export class SetLabelsRequest {
  labels!: string[];
}

export class LabelChatAssociation {
  chatId!: string;
  labelId!: string;
  type?: string;
}
