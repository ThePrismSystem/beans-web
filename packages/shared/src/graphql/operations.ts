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

export const UPDATE_BEAN_MUTATION = /* GraphQL */ `
  mutation UpdateBean($id: ID!, $input: UpdateBeanInput!) {
    updateBean(id: $id, input: $input) {
      id
      etag
    }
  }
`;

export const CREATE_BEAN_MUTATION = /* GraphQL */ `
  mutation CreateBean($input: CreateBeanInput!) {
    createBean(input: $input) {
      id
      etag
    }
  }
`;

export const DELETE_BEAN_MUTATION = /* GraphQL */ `
  mutation DeleteBean($id: ID!) {
    deleteBean(id: $id)
  }
`;

export const SET_PARENT_MUTATION = /* GraphQL */ `
  mutation SetParent($id: ID!, $parentId: String, $ifMatch: String) {
    setParent(id: $id, parentId: $parentId, ifMatch: $ifMatch) {
      id
      etag
    }
  }
`;

export const ADD_BLOCKING_MUTATION = /* GraphQL */ `
  mutation AddBlocking($id: ID!, $targetId: ID!, $ifMatch: String) {
    addBlocking(id: $id, targetId: $targetId, ifMatch: $ifMatch) {
      id
      etag
    }
  }
`;

export const REMOVE_BLOCKING_MUTATION = /* GraphQL */ `
  mutation RemoveBlocking($id: ID!, $targetId: ID!, $ifMatch: String) {
    removeBlocking(id: $id, targetId: $targetId, ifMatch: $ifMatch) {
      id
      etag
    }
  }
`;

export const ADD_BLOCKED_BY_MUTATION = /* GraphQL */ `
  mutation AddBlockedBy($id: ID!, $targetId: ID!, $ifMatch: String) {
    addBlockedBy(id: $id, targetId: $targetId, ifMatch: $ifMatch) {
      id
      etag
    }
  }
`;

export const REMOVE_BLOCKED_BY_MUTATION = /* GraphQL */ `
  mutation RemoveBlockedBy($id: ID!, $targetId: ID!, $ifMatch: String) {
    removeBlockedBy(id: $id, targetId: $targetId, ifMatch: $ifMatch) {
      id
      etag
    }
  }
`;
