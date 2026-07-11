export const BEAN_DETAIL_QUERY = /* GraphQL */ `
  query BeanDetail($id: ID!) {
    bean(id: $id) {
      id
      slug
      path
      title
      status
      type
      priority
      tags
      body
      etag
      parentId
      createdAt
      updatedAt
      blockingIds
      blockedByIds
      parent {
        id
        title
        type
        status
      }
      children {
        id
        title
        type
        status
      }
      blocking {
        id
        title
        type
        status
      }
      blockedBy {
        id
        title
        type
        status
      }
    }
  }
`;
