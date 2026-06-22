export class ContactQuery {
  session?: string;
  contactId: string;
}

export class ContactProfilePictureQuery extends ContactQuery {
  refresh?: boolean;
}

export class ContactRequest {
  session?: string;
  contactId: string;
}

export class ContactUpdateBody {
  firstName?: string;
  lastName?: string;
}
